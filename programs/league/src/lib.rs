//! League escrow: weekly rounds of on-chain stock baskets ("ETFs") that try
//! to beat MEDIAN.
//!
//! Creators lock a basket of 3–10 allowed stock tokens (xStocks) plus one
//! ticket (USDC). The locked quantities ARE the ETF: its score is the
//! buy-and-hold return of exactly what was locked. Backers join a creator's
//! team with a ticket only.
//!
//! Settlement is computed off-chain by the open-source engine and written by
//! the keeper in batches (a disclosed trust assumption). The program enforces:
//!   - conservation: Σ payouts + platform + season_in == Σ stakes + season_out + bonus
//!   - the season pot can never go negative
//!   - no payout above stake × (1 + cap × (1 + max_backers)) + bonus
//!   - every entry gets exactly one payout before the round counts as settled
//!   - locked baskets always go back to their owner, whatever the result
//!   - liveness: VOID_GRACE after the end, anyone can void an unsettled round
//!     and everyone gets their stake back.
//! The inputs (prices, baskets, team keys) are committed by hash and
//! published, so anyone can recompute the payouts. Team keys and basket
//! rules (≥ $10, weights, crypto slice) are checked by the keeper; an invalid
//! entry is refunded its stake.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::{get_associated_token_address_with_program_id, AssociatedToken};
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

pub mod error;
pub mod state;

use error::LeagueError;
use state::*;

declare_id!("8d88mxfH12NXWg9RfvkpFXztGBAkYMsbNxAXyfvwT3uA");

#[program]
pub mod league {
    use super::*;

    // --- admin ---------------------------------------------------------------

    pub fn initialize(ctx: Context<Initialize>, keeper: Pubkey) -> Result<()> {
        let c = &mut ctx.accounts.config;
        c.admin = ctx.accounts.admin.key();
        c.keeper = keeper;
        c.stake_mint = ctx.accounts.stake_mint.key();
        c.paused = false;
        c.round_count = 0;
        c.season_pot = 0;
        c.platform_balance = 0;
        c.bump = ctx.bumps.config;
        ctx.accounts.registry.bump = ctx.bumps.registry;
        Ok(())
    }

    pub fn set_admin(ctx: Context<AdminOnly>, admin: Pubkey) -> Result<()> {
        ctx.accounts.config.admin = admin;
        Ok(())
    }

    pub fn set_keeper(ctx: Context<AdminOnly>, keeper: Pubkey) -> Result<()> {
        ctx.accounts.config.keeper = keeper;
        Ok(())
    }

    pub fn set_paused(ctx: Context<AdminOnly>, paused: bool) -> Result<()> {
        ctx.accounts.config.paused = paused;
        Ok(())
    }

    /// Allow (or disable) a token in baskets, creating its vault if needed.
    pub fn set_asset(ctx: Context<SetAsset>, enabled: bool, is_crypto: bool) -> Result<()> {
        let mint = ctx.accounts.mint.key();
        require_keys_neq!(mint, ctx.accounts.config.stake_mint, LeagueError::TokenNotAllowed);
        let reg = &mut ctx.accounts.registry;
        match reg.assets.iter_mut().find(|a| a.mint == mint) {
            Some(a) => {
                a.enabled = enabled;
                a.is_crypto = is_crypto;
            }
            None => {
                require!(reg.assets.len() < MAX_ASSETS, LeagueError::RegistryFull);
                reg.assets.push(Asset { mint, is_crypto, enabled });
            }
        }
        emit!(AssetSet { mint, enabled, is_crypto });
        Ok(())
    }

    /// Seed the season pot (used for thin-pot top-ups). Anyone can.
    pub fn fund_season(ctx: Context<MoveStake>, amount: u64) -> Result<()> {
        require!(amount > 0, LeagueError::ZeroAmount);
        pull_stake(&ctx.accounts.stake_mint, &ctx.accounts.user_stake, &ctx.accounts.stake_vault, &ctx.accounts.user, &ctx.accounts.token_program, amount)?;
        let c = &mut ctx.accounts.config;
        c.season_pot = c.season_pot.checked_add(amount).ok_or(LeagueError::Overflow)?;
        emit!(SeasonFunded { amount });
        Ok(())
    }

    pub fn withdraw_platform(ctx: Context<WithdrawPlatform>, amount: u64) -> Result<()> {
        let c = &ctx.accounts.config;
        require!(amount > 0, LeagueError::ZeroAmount);
        require!(amount <= c.platform_balance, LeagueError::InsufficientBalance);
        push_from_vault(
            &ctx.accounts.config.to_account_info(),
            c.bump,
            &ctx.accounts.stake_mint.to_account_info(),
            ctx.accounts.stake_mint.decimals,
            &ctx.accounts.stake_vault.to_account_info(),
            &ctx.accounts.destination.to_account_info(),
            ctx.accounts.token_program.key(),
            amount,
        )?;
        ctx.accounts.config.platform_balance -= amount;
        Ok(())
    }

    // --- rounds --------------------------------------------------------------

    pub fn open_round(ctx: Context<OpenRound>, entry_close: i64, end: i64, stake: u64, cap_multiple: u16, max_backers: u16) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(entry_close > now && end > entry_close && stake > 0 && cap_multiple > 0, LeagueError::BadTimes);
        let c = &mut ctx.accounts.config;
        c.round_count += 1;
        let r = &mut ctx.accounts.round;
        r.id = c.round_count;
        r.status = RoundStatus::Open;
        r.entry_close = entry_close;
        r.end = end;
        r.stake = stake;
        r.cap_multiple = cap_multiple;
        r.max_backers = max_backers;
        r.bump = ctx.bumps.round;
        emit!(RoundOpened { round_id: r.id, entry_close, end, stake });
        Ok(())
    }

    /// Enter as a creator: lock a basket plus one ticket. Remaining accounts,
    /// per leg in `weights` order: [mint, user token account, vault].
    /// The first creator with `team_key` becomes its captain (and names the
    /// ETF); a later creator with the same key joins that team as a clone.
    pub fn enter_creator<'info>(
        ctx: Context<'info, EnterCreator<'info>>,
        round_id: u64,
        team_key: [u8; 32],
        amounts: Vec<u64>,
        weights: Vec<u16>,
        name: String,
        buy_fee_bps: u16,
    ) -> Result<()> {
        let _ = round_id;
        let n = weights.len();
        require!(amounts.len() == n, LeagueError::LengthMismatch);
        require!((MIN_BASKET_TOKENS..=MAX_BASKET_TOKENS).contains(&n), LeagueError::BadBasket);
        require!(weights.iter().map(|w| *w as u32).sum::<u32>() == 10_000, LeagueError::BadBasket);
        require!(team_key != [0u8; 32], LeagueError::BadBasket);
        require!(!name.is_empty() && name.len() <= MAX_NAME_BYTES && buy_fee_bps <= MAX_BUY_FEE_BPS, LeagueError::BadName);
        require!(ctx.remaining_accounts.len() == 3 * n, LeagueError::LengthMismatch);
        check_open(&ctx.accounts.config, &ctx.accounts.round)?;

        // Team: captain or clone.
        let wallet = ctx.accounts.user.key();
        let round = &mut ctx.accounts.round;
        let team = &mut ctx.accounts.team;
        let captain = team.captain == Pubkey::default();
        let config_key = ctx.accounts.config.key();
        let mut legs: Vec<Leg> = Vec::with_capacity(n);
        let mut locked: Vec<Locked> = Vec::with_capacity(n);

        for i in 0..n {
            let mint_info = &ctx.remaining_accounts[3 * i];
            let from_info = &ctx.remaining_accounts[3 * i + 1];
            let vault_info = &ctx.remaining_accounts[3 * i + 2];
            let mint_key = mint_info.key();
            require!(amounts[i] > 0 && weights[i] > 0, LeagueError::BadBasket);
            require!(legs.iter().all(|l| l.mint != mint_key), LeagueError::BadBasket);
            let asset = ctx.accounts.registry.find(&mint_key).ok_or(LeagueError::TokenNotAllowed)?;
            require!(asset.enabled, LeagueError::TokenNotAllowed);

            let token_program = token_program_for(mint_info, &ctx.accounts.token_program, &ctx.accounts.basket_token_program)?;
            let vault_ata = get_associated_token_address_with_program_id(&config_key, &mint_key, &token_program.key());
            require_keys_eq!(vault_info.key(), vault_ata, LeagueError::BadVault);
            let decimals = InterfaceAccount::<Mint>::try_from(mint_info)?.decimals;

            let before = InterfaceAccount::<TokenAccount>::try_from(vault_info)?.amount;
            token_interface::transfer_checked(
                CpiContext::new(
                    token_program.key(),
                    TransferChecked {
                        from: from_info.clone(),
                        mint: mint_info.clone(),
                        to: vault_info.clone(),
                        authority: ctx.accounts.user.to_account_info(),
                    },
                ),
                amounts[i],
                decimals,
            )?;
            let received = InterfaceAccount::<TokenAccount>::try_from(vault_info)?.amount - before;
            require!(received > 0, LeagueError::BadBasket);
            legs.push(Leg { mint: mint_key, weight_bps: weights[i] });
            locked.push(Locked { mint: mint_key, amount: received, weight_bps: weights[i], returned: false });
        }

        if captain {
            team.round_id = round.id;
            team.key = team_key;
            team.captain = wallet;
            team.members = 0;
            team.name = name.clone();
            team.buy_fee_bps = buy_fee_bps;
            team.legs = legs;
            team.bump = ctx.bumps.team;
            round.team_count += 1;
            emit!(TeamCreated { round_id: round.id, team_key, captain: wallet, name, buy_fee_bps });
        } else {
            add_member(round, team)?;
        }

        let entry = &mut ctx.accounts.entry;
        entry.round_id = round.id;
        entry.wallet = wallet;
        entry.team_key = team_key;
        entry.index = round.entry_count;
        entry.is_creator = true;
        entry.payout_epoch = 0;
        entry.claimed = false;
        entry.payout = 0;
        entry.basket = locked;
        entry.bump = ctx.bumps.entry;
        take_ticket(round, &ctx.accounts.stake_mint, &ctx.accounts.user_stake, &ctx.accounts.stake_vault, &ctx.accounts.user, &ctx.accounts.token_program)?;

        emit!(CreatorEntered { round_id: round.id, wallet, team_key, captain, index: entry.index, amounts: entry.basket.iter().map(|l| l.amount).collect() });
        Ok(())
    }

    /// Back a creator's team with one ticket.
    pub fn enter_backer(ctx: Context<EnterBacker>, round_id: u64, team_key: [u8; 32]) -> Result<()> {
        let _ = round_id;
        check_open(&ctx.accounts.config, &ctx.accounts.round)?;
        let round = &mut ctx.accounts.round;
        add_member(round, &mut ctx.accounts.team)?;
        let wallet = ctx.accounts.user.key();
        let entry = &mut ctx.accounts.entry;
        entry.round_id = round.id;
        entry.wallet = wallet;
        entry.team_key = team_key;
        entry.index = round.entry_count;
        entry.is_creator = false;
        entry.payout_epoch = 0;
        entry.claimed = false;
        entry.payout = 0;
        entry.basket = Vec::new();
        entry.bump = ctx.bumps.entry;
        take_ticket(round, &ctx.accounts.stake_mint, &ctx.accounts.user_stake, &ctx.accounts.stake_vault, &ctx.accounts.user, &ctx.accounts.token_program)?;
        emit!(BackerEntered { round_id: round.id, wallet, team_key, index: entry.index });
        Ok(())
    }

    /// Add a sponsor boost to a round's pot (anyone, before settlement starts).
    pub fn boost_round(ctx: Context<BoostRound>, round_id: u64, amount: u64) -> Result<()> {
        let _ = round_id;
        require!(amount > 0, LeagueError::ZeroAmount);
        require!(ctx.accounts.round.status == RoundStatus::Open, LeagueError::BadRound);
        pull_stake(&ctx.accounts.stake_mint, &ctx.accounts.user_stake, &ctx.accounts.stake_vault, &ctx.accounts.user, &ctx.accounts.token_program, amount)?;
        let r = &mut ctx.accounts.round;
        r.bonus = r.bonus.checked_add(amount).ok_or(LeagueError::Overflow)?;
        emit!(RoundBoosted { round_id: r.id, by: ctx.accounts.user.key(), amount });
        Ok(())
    }

    // --- settlement ----------------------------------------------------------

    /// Commit the settlement totals. Conservation is checked here; the
    /// per-entry payouts that follow must add up to `total_payout`.
    pub fn settle_begin(
        ctx: Context<KeeperRound>,
        round_id: u64,
        total_payout: u64,
        platform_cut: u64,
        season_in: u64,
        season_out: u64,
        inputs_hash: [u8; 32],
    ) -> Result<()> {
        let _ = round_id;
        let c = &ctx.accounts.config;
        let r = &mut ctx.accounts.round;
        require!(r.status == RoundStatus::Open || r.status == RoundStatus::Settling, LeagueError::BadRound);
        require!(Clock::get()?.unix_timestamp >= r.end, LeagueError::TooEarly);
        let out = total_payout as u128 + platform_cut as u128 + season_in as u128;
        let inn = r.total_stakes as u128 + season_out as u128 + r.bonus as u128;
        require!(out == inn, LeagueError::NotConserved);
        require!(season_out as u128 <= c.season_pot as u128 + season_in as u128, LeagueError::SeasonOverdrawn);
        // A new epoch: anything written by an earlier settle_begin must be rewritten.
        r.settle_epoch = r.settle_epoch.checked_add(1).ok_or(LeagueError::Overflow)?;
        r.status = RoundStatus::Settling;
        r.total_payout = total_payout;
        r.platform_cut = platform_cut;
        r.season_in = season_in;
        r.season_out = season_out;
        r.inputs_hash = inputs_hash;
        r.written_count = 0;
        r.written_sum = 0;
        Ok(())
    }

    /// Write payouts for a batch of entries (remaining accounts, writable),
    /// in any order. Rewriting an entry in the same epoch replaces its payout.
    pub fn settle_write<'info>(ctx: Context<'info, KeeperRound<'info>>, round_id: u64, payouts: Vec<u64>) -> Result<()> {
        let _ = round_id;
        let r = &mut ctx.accounts.round;
        require!(r.status == RoundStatus::Settling, LeagueError::BadRound);
        require!(payouts.len() == ctx.remaining_accounts.len(), LeagueError::LengthMismatch);
        let max = r.max_payout();
        for (info, payout) in ctx.remaining_accounts.iter().zip(payouts) {
            require!(info.is_writable, LeagueError::WrongRound);
            let mut e: Account<Entry> = Account::try_from(info)?;
            require!(e.round_id == r.id, LeagueError::WrongRound);
            require!(payout as u128 <= max, LeagueError::PayoutTooLarge);
            if e.payout_epoch == r.settle_epoch {
                r.written_sum = r.written_sum.checked_sub(e.payout).ok_or(LeagueError::Overflow)?;
            } else {
                r.written_count += 1;
                e.payout_epoch = r.settle_epoch;
            }
            r.written_sum = r.written_sum.checked_add(payout).ok_or(LeagueError::Overflow)?;
            e.payout = payout;
            e.exit(&crate::ID)?;
        }
        Ok(())
    }

    /// Finish once every entry has its payout and they add up.
    pub fn settle_finish(ctx: Context<KeeperRound>, round_id: u64) -> Result<()> {
        let _ = round_id;
        let r = &mut ctx.accounts.round;
        require!(r.status == RoundStatus::Settling, LeagueError::BadRound);
        require!(r.written_count == r.entry_count, LeagueError::SettlementIncomplete);
        require!(r.written_sum == r.total_payout, LeagueError::NotConserved);
        let c = &mut ctx.accounts.config;
        c.season_pot = c
            .season_pot
            .checked_add(r.season_in)
            .and_then(|x| x.checked_sub(r.season_out))
            .ok_or(LeagueError::SeasonOverdrawn)?;
        c.platform_balance = c.platform_balance.checked_add(r.platform_cut).ok_or(LeagueError::Overflow)?;
        r.status = RoundStatus::Settled;
        emit!(RoundSettled { round_id: r.id, inputs_hash: r.inputs_hash, total_payout: r.total_payout, platform_cut: r.platform_cut, season_in: r.season_in, season_out: r.season_out });
        Ok(())
    }

    /// Void a round: everyone gets their stake and basket back. Keeper/admin
    /// any time before it is settled (bad prices, outage); anyone once
    /// VOID_GRACE has passed after the end.
    pub fn void_round(ctx: Context<VoidRound>, round_id: u64) -> Result<()> {
        let _ = round_id;
        let c = &mut ctx.accounts.config;
        let r = &mut ctx.accounts.round;
        require!(r.status == RoundStatus::Open || r.status == RoundStatus::Settling, LeagueError::BadRound);
        let who = ctx.accounts.signer.key();
        let privileged = who == c.keeper || who == c.admin;
        if !privileged {
            require!(Clock::get()?.unix_timestamp >= r.end + VOID_GRACE_SECS, LeagueError::TooEarly);
        }
        r.status = RoundStatus::Voided;
        // Stakes are refunded; a boost goes to the season pot.
        c.season_pot = c.season_pot.checked_add(r.bonus).ok_or(LeagueError::Overflow)?;
        emit!(RoundVoided { round_id: r.id });
        Ok(())
    }

    // --- claims --------------------------------------------------------------

    /// Claim the payout (or the refund of a void round). Closes the entry
    /// once any basket has gone back too.
    pub fn claim(ctx: Context<Claim>, round_id: u64) -> Result<()> {
        let _ = round_id;
        let r = &ctx.accounts.round;
        let e = &mut ctx.accounts.entry;
        require!(!e.claimed, LeagueError::NothingToClaim);
        let amount = match r.status {
            RoundStatus::Settled => e.payout,
            RoundStatus::Voided => r.stake,
            _ => return err!(LeagueError::BadRound),
        };
        e.claimed = true;
        if amount > 0 {
            push_from_vault(
                &ctx.accounts.config.to_account_info(),
                ctx.accounts.config.bump,
                &ctx.accounts.stake_mint.to_account_info(),
                ctx.accounts.stake_mint.decimals,
                &ctx.accounts.stake_vault.to_account_info(),
                &ctx.accounts.user_stake.to_account_info(),
                ctx.accounts.token_program.key(),
                amount,
            )?;
        }
        emit!(Claimed { round_id: r.id, wallet: e.wallet, amount });
        if e.basket_back() {
            e.close(ctx.accounts.user.to_account_info())?;
        }
        Ok(())
    }

    /// Send locked basket tokens back to their owner once the round is over.
    /// Anyone can call it (the tokens only ever go to the owner). Remaining
    /// accounts, per leg to return: [mint, vault, owner's token account].
    /// Legs can be returned in several calls (e.g. if one token is paused).
    pub fn return_basket<'info>(ctx: Context<'info, ReturnBasket<'info>>, round_id: u64) -> Result<()> {
        let _ = round_id;
        let r = &ctx.accounts.round;
        require!(r.status == RoundStatus::Settled || r.status == RoundStatus::Voided, LeagueError::BadRound);
        require!(ctx.remaining_accounts.len() % 3 == 0, LeagueError::LengthMismatch);
        let config_info = ctx.accounts.config.to_account_info();
        let config_key = config_info.key();
        let bump = ctx.accounts.config.bump;
        let e = &mut ctx.accounts.entry;
        let owner = e.wallet;
        for chunk in ctx.remaining_accounts.chunks(3) {
            let (mint_info, vault_info, to_info) = (&chunk[0], &chunk[1], &chunk[2]);
            let mint_key = mint_info.key();
            let Some(leg) = e.basket.iter_mut().find(|l| l.mint == mint_key && !l.returned) else { continue };
            let token_program = token_program_for(mint_info, &ctx.accounts.token_program, &ctx.accounts.basket_token_program)?;
            let vault_ata = get_associated_token_address_with_program_id(&config_key, &mint_key, &token_program.key());
            require_keys_eq!(vault_info.key(), vault_ata, LeagueError::BadVault);
            let to = InterfaceAccount::<TokenAccount>::try_from(to_info)?;
            require!(to.owner == owner && to.mint == mint_key, LeagueError::BadTokenAccount);
            let decimals = InterfaceAccount::<Mint>::try_from(mint_info)?.decimals;
            push_from_vault(&config_info, bump, mint_info, decimals, vault_info, to_info, token_program.key(), leg.amount)?;
            leg.returned = true;
            emit!(BasketReturned { round_id: r.id, wallet: owner, mint: mint_key, amount: leg.amount });
        }
        if e.claimed && e.basket_back() {
            e.close(ctx.accounts.owner.to_account_info())?;
        }
        Ok(())
    }
}

// --- helpers -----------------------------------------------------------------

fn check_open(config: &Config, round: &Round) -> Result<()> {
    require!(!config.paused, LeagueError::Paused);
    require!(round.status == RoundStatus::Open, LeagueError::BadRound);
    require!(Clock::get()?.unix_timestamp < round.entry_close, LeagueError::EntriesClosed);
    Ok(())
}

fn add_member(round: &Round, team: &mut Team) -> Result<()> {
    require!(team.captain != Pubkey::default(), LeagueError::NoSuchTeam);
    require!(team.members < round.max_backers, LeagueError::TeamFull);
    team.members += 1;
    Ok(())
}

fn take_ticket<'info>(
    round: &mut Round,
    mint: &InterfaceAccount<'info, Mint>,
    from: &InterfaceAccount<'info, TokenAccount>,
    vault: &InterfaceAccount<'info, TokenAccount>,
    user: &Signer<'info>,
    token_program: &Interface<'info, TokenInterface>,
) -> Result<()> {
    pull_stake(mint, from, vault, user, token_program, round.stake)?;
    round.total_stakes = round.total_stakes.checked_add(round.stake).ok_or(LeagueError::Overflow)?;
    round.entry_count += 1;
    Ok(())
}

fn pull_stake<'info>(
    mint: &InterfaceAccount<'info, Mint>,
    from: &InterfaceAccount<'info, TokenAccount>,
    vault: &InterfaceAccount<'info, TokenAccount>,
    user: &Signer<'info>,
    token_program: &Interface<'info, TokenInterface>,
    amount: u64,
) -> Result<()> {
    token_interface::transfer_checked(
        CpiContext::new(
            token_program.key(),
            TransferChecked { from: from.to_account_info(), mint: mint.to_account_info(), to: vault.to_account_info(), authority: user.to_account_info() },
        ),
        amount,
        mint.decimals,
    )
}

#[allow(clippy::too_many_arguments)]
fn push_from_vault<'info>(
    config: &AccountInfo<'info>,
    bump: u8,
    mint: &AccountInfo<'info>,
    decimals: u8,
    vault: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    token_program: Pubkey,
    amount: u64,
) -> Result<()> {
    let seeds: &[&[u8]] = &[CONFIG_SEED, &[bump]];
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            token_program,
            TransferChecked { from: vault.clone(), mint: mint.clone(), to: to.clone(), authority: config.clone() },
            &[seeds],
        ),
        amount,
        decimals,
    )
}

/// The token program that owns `mint`: one of the two passed in.
fn token_program_for<'a, 'info>(
    mint: &AccountInfo<'info>,
    a: &'a Interface<'info, TokenInterface>,
    b: &'a Interface<'info, TokenInterface>,
) -> Result<&'a Interface<'info, TokenInterface>> {
    if *mint.owner == a.key() {
        Ok(a)
    } else if *mint.owner == b.key() {
        Ok(b)
    } else {
        err!(LeagueError::TokenNotAllowed)
    }
}

// --- accounts ----------------------------------------------------------------

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    #[account(init, payer = admin, space = 8 + Registry::INIT_SPACE, seeds = [REGISTRY_SEED], bump)]
    pub registry: Account<'info, Registry>,
    pub stake_mint: InterfaceAccount<'info, Mint>,
    #[account(
        init, payer = admin,
        associated_token::mint = stake_mint,
        associated_token::authority = config,
        associated_token::token_program = token_program,
    )]
    pub stake_vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ LeagueError::NotAdmin)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct SetAsset<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ LeagueError::NotAdmin)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [REGISTRY_SEED], bump = registry.bump)]
    pub registry: Account<'info, Registry>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        init_if_needed, payer = admin,
        associated_token::mint = mint,
        associated_token::authority = config,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MoveStake<'info> {
    pub user: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = stake_mint)]
    pub config: Account<'info, Config>,
    pub stake_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = stake_mint, token::authority = user, token::token_program = token_program)]
    pub user_stake: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, associated_token::mint = stake_mint, associated_token::authority = config, associated_token::token_program = token_program)]
    pub stake_vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct WithdrawPlatform<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ LeagueError::NotAdmin, has_one = stake_mint)]
    pub config: Account<'info, Config>,
    pub stake_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, associated_token::mint = stake_mint, associated_token::authority = config, associated_token::token_program = token_program)]
    pub stake_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = stake_mint, token::token_program = token_program)]
    pub destination: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct OpenRound<'info> {
    #[account(mut, constraint = keeper.key() == config.keeper || keeper.key() == config.admin @ LeagueError::NotKeeper)]
    pub keeper: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init, payer = keeper, space = 8 + Round::INIT_SPACE,
        seeds = [ROUND_SEED, &(config.round_count + 1).to_le_bytes()], bump,
    )]
    pub round: Account<'info, Round>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(round_id: u64, team_key: [u8; 32], amounts: Vec<u64>)]
pub struct EnterCreator<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = stake_mint)]
    pub config: Account<'info, Config>,
    #[account(seeds = [REGISTRY_SEED], bump = registry.bump)]
    pub registry: Account<'info, Registry>,
    #[account(mut, seeds = [ROUND_SEED, &round_id.to_le_bytes()], bump = round.bump)]
    pub round: Account<'info, Round>,
    #[account(
        init_if_needed, payer = user, space = Team::space(amounts.len()),
        seeds = [TEAM_SEED, &round_id.to_le_bytes(), &team_key], bump,
    )]
    pub team: Account<'info, Team>,
    #[account(
        init, payer = user, space = Entry::space(amounts.len()),
        seeds = [ENTRY_SEED, &round_id.to_le_bytes(), user.key().as_ref()], bump,
    )]
    pub entry: Account<'info, Entry>,
    pub stake_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = stake_mint, token::authority = user, token::token_program = token_program)]
    pub user_stake: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, associated_token::mint = stake_mint, associated_token::authority = config, associated_token::token_program = token_program)]
    pub stake_vault: InterfaceAccount<'info, TokenAccount>,
    /// The stake mint's token program (classic Token for USDC).
    pub token_program: Interface<'info, TokenInterface>,
    /// The basket tokens' program (Token-2022 for xStocks; may equal token_program).
    pub basket_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(round_id: u64, team_key: [u8; 32])]
pub struct EnterBacker<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = stake_mint)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [ROUND_SEED, &round_id.to_le_bytes()], bump = round.bump)]
    pub round: Account<'info, Round>,
    #[account(mut, seeds = [TEAM_SEED, &round_id.to_le_bytes(), &team_key], bump = team.bump)]
    pub team: Account<'info, Team>,
    #[account(
        init, payer = user, space = Entry::space(0),
        seeds = [ENTRY_SEED, &round_id.to_le_bytes(), user.key().as_ref()], bump,
    )]
    pub entry: Account<'info, Entry>,
    pub stake_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = stake_mint, token::authority = user, token::token_program = token_program)]
    pub user_stake: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, associated_token::mint = stake_mint, associated_token::authority = config, associated_token::token_program = token_program)]
    pub stake_vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct BoostRound<'info> {
    pub user: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = stake_mint)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [ROUND_SEED, &round_id.to_le_bytes()], bump = round.bump)]
    pub round: Account<'info, Round>,
    pub stake_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = stake_mint, token::authority = user, token::token_program = token_program)]
    pub user_stake: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, associated_token::mint = stake_mint, associated_token::authority = config, associated_token::token_program = token_program)]
    pub stake_vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct KeeperRound<'info> {
    #[account(constraint = keeper.key() == config.keeper || keeper.key() == config.admin @ LeagueError::NotKeeper)]
    pub keeper: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [ROUND_SEED, &round_id.to_le_bytes()], bump = round.bump)]
    pub round: Account<'info, Round>,
}

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct VoidRound<'info> {
    pub signer: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [ROUND_SEED, &round_id.to_le_bytes()], bump = round.bump)]
    pub round: Account<'info, Round>,
}

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct Claim<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = stake_mint)]
    pub config: Account<'info, Config>,
    #[account(seeds = [ROUND_SEED, &round_id.to_le_bytes()], bump = round.bump)]
    pub round: Account<'info, Round>,
    #[account(
        mut, seeds = [ENTRY_SEED, &round_id.to_le_bytes(), user.key().as_ref()], bump = entry.bump,
    )]
    pub entry: Account<'info, Entry>,
    pub stake_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = stake_mint, token::authority = user, token::token_program = token_program)]
    pub user_stake: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, associated_token::mint = stake_mint, associated_token::authority = config, associated_token::token_program = token_program)]
    pub stake_vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct ReturnBasket<'info> {
    pub signer: Signer<'info>,
    /// CHECK: the entry's wallet: receives the entry's rent when it closes.
    #[account(mut, address = entry.wallet)]
    pub owner: UncheckedAccount<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(seeds = [ROUND_SEED, &round_id.to_le_bytes()], bump = round.bump)]
    pub round: Account<'info, Round>,
    #[account(mut, seeds = [ENTRY_SEED, &round_id.to_le_bytes(), owner.key().as_ref()], bump = entry.bump)]
    pub entry: Account<'info, Entry>,
    pub token_program: Interface<'info, TokenInterface>,
    pub basket_token_program: Interface<'info, TokenInterface>,
}

// --- events ------------------------------------------------------------------

#[event]
pub struct AssetSet {
    pub mint: Pubkey,
    pub enabled: bool,
    pub is_crypto: bool,
}

#[event]
pub struct SeasonFunded {
    pub amount: u64,
}

#[event]
pub struct RoundOpened {
    pub round_id: u64,
    pub entry_close: i64,
    pub end: i64,
    pub stake: u64,
}

#[event]
pub struct TeamCreated {
    pub round_id: u64,
    pub team_key: [u8; 32],
    pub captain: Pubkey,
    pub name: String,
    pub buy_fee_bps: u16,
}

#[event]
pub struct CreatorEntered {
    pub round_id: u64,
    pub wallet: Pubkey,
    pub team_key: [u8; 32],
    pub captain: bool,
    pub index: u32,
    pub amounts: Vec<u64>,
}

#[event]
pub struct BackerEntered {
    pub round_id: u64,
    pub wallet: Pubkey,
    pub team_key: [u8; 32],
    pub index: u32,
}

#[event]
pub struct RoundBoosted {
    pub round_id: u64,
    pub by: Pubkey,
    pub amount: u64,
}

#[event]
pub struct RoundSettled {
    pub round_id: u64,
    pub inputs_hash: [u8; 32],
    pub total_payout: u64,
    pub platform_cut: u64,
    pub season_in: u64,
    pub season_out: u64,
}

#[event]
pub struct RoundVoided {
    pub round_id: u64,
}

#[event]
pub struct Claimed {
    pub round_id: u64,
    pub wallet: Pubkey,
    pub amount: u64,
}

#[event]
pub struct BasketReturned {
    pub round_id: u64,
    pub wallet: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
}
