use anchor_lang::prelude::*;

pub const CONFIG_SEED: &[u8] = b"config";
pub const REGISTRY_SEED: &[u8] = b"registry";
pub const ROUND_SEED: &[u8] = b"round";
pub const TEAM_SEED: &[u8] = b"team";
pub const ENTRY_SEED: &[u8] = b"entry";

pub const MIN_BASKET_TOKENS: usize = 3;
pub const MAX_BASKET_TOKENS: usize = 10;
pub const MAX_ASSETS: usize = 64;
pub const MAX_NAME_BYTES: usize = 32;
pub const MAX_BUY_FEE_BPS: u16 = 200;
pub const VOID_GRACE_SECS: i64 = 3 * 24 * 60 * 60;

/// Program-wide settings. Its PDA also owns every vault: the ticket vault
/// (stake mint) and one basket vault per allowed stock token.
#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub keeper: Pubkey,
    pub stake_mint: Pubkey,
    pub paused: bool,
    pub round_count: u64,
    /// Season pot: half the take, used to top up thin pots.
    pub season_pot: u64,
    /// Platform's half of the take, withdrawable by the admin.
    pub platform_balance: u64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub struct Asset {
    pub mint: Pubkey,
    /// Crypto (wrapped BTC, ETH, SOL…): capped as a slice of the basket.
    pub is_crypto: bool,
    pub enabled: bool,
}

/// The tokens a basket may hold.
#[account]
#[derive(InitSpace)]
pub struct Registry {
    #[max_len(MAX_ASSETS)]
    pub assets: Vec<Asset>,
    pub bump: u8,
}

impl Registry {
    pub fn find(&self, mint: &Pubkey) -> Option<&Asset> {
        self.assets.iter().find(|a| a.mint == *mint)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum RoundStatus {
    Open,
    /// The keeper is writing payouts (settle_begin … settle_finish).
    Settling,
    Settled,
    Voided,
}

#[account]
#[derive(InitSpace)]
pub struct Round {
    pub id: u64,
    pub status: RoundStatus,
    /// Entries rejected at/after this time (unix seconds).
    pub entry_close: i64,
    /// Settlement allowed at/after this time.
    pub end: i64,
    /// Fixed ticket, stake-mint base units.
    pub stake: u64,
    /// Max team gain = cap_multiple × team stake.
    pub cap_multiple: u16,
    /// Per team, captain excluded.
    pub max_backers: u16,
    pub entry_count: u32,
    pub team_count: u32,
    pub total_stakes: u64,
    /// Sponsor boosts (and later ticket yield) added to the winners' pot.
    pub bonus: u64,
    /// Hash of the published settlement inputs: anyone can recompute payouts.
    pub inputs_hash: [u8; 32],
    // Totals committed by settle_begin, checked for conservation.
    pub total_payout: u64,
    pub platform_cut: u64,
    pub season_in: u64,
    pub season_out: u64,
    // Progress of settle_write, for the current settle_epoch.
    /// Bumped by every settle_begin: payouts written under an older epoch
    /// don't count, so the keeper can restart a settlement cleanly.
    pub settle_epoch: u32,
    pub written_count: u32,
    pub written_sum: u64,
    pub bump: u8,
}

impl Round {
    /// Per-entry ceiling: a team's gain is capped at cap × team stake, and the
    /// captain can receive (through creator fees) up to the whole team's gain,
    /// so stake × (1 + cap × (1 + max_backers)), plus the bonus.
    pub fn max_payout(&self) -> u128 {
        (self.stake as u128) * (1 + (self.cap_multiple as u128) * (1 + self.max_backers as u128)) + self.bonus as u128
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub struct Leg {
    pub mint: Pubkey,
    pub weight_bps: u16,
}

/// One ETF. The first creator with a team key is the captain; a later creator
/// with the same key (a clone: same stocks, same weights to 1%) joins the team.
#[account]
pub struct Team {
    pub round_id: u64,
    pub key: [u8; 32],
    pub captain: Pubkey,
    /// Non-captain members: clones and backers.
    pub members: u16,
    pub name: String,
    /// Fee (bps) the creator earns when someone buys the ETF through the app.
    pub buy_fee_bps: u16,
    pub legs: Vec<Leg>,
    pub bump: u8,
}

impl Team {
    pub fn space(legs: usize) -> usize {
        8 + 8 + 32 + 32 + 2 + (4 + MAX_NAME_BYTES) + 2 + (4 + legs * Leg::INIT_SPACE) + 1
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub struct Locked {
    pub mint: Pubkey,
    /// Base units actually received by the vault.
    pub amount: u64,
    pub weight_bps: u16,
    pub returned: bool,
}

/// A wallet's place in a round. Closed (rent back to the wallet) once the
/// payout is claimed and any basket has gone back.
#[account]
pub struct Entry {
    pub round_id: u64,
    pub wallet: Pubkey,
    pub team_key: [u8; 32],
    /// Order of entry: settlement payouts are written in this order.
    pub index: u32,
    pub is_creator: bool,
    /// settle_epoch under which `payout` was written (0 = never).
    pub payout_epoch: u32,
    pub claimed: bool,
    pub payout: u64,
    pub basket: Vec<Locked>,
    pub bump: u8,
}

impl Entry {
    pub fn space(legs: usize) -> usize {
        8 + 8 + 32 + 32 + 4 + 1 + 4 + 1 + 8 + (4 + legs * Locked::INIT_SPACE) + 1
    }

    pub fn basket_back(&self) -> bool {
        self.basket.iter().all(|l| l.returned)
    }
}
