use anchor_lang::prelude::*;

#[error_code]
pub enum LeagueError {
    #[msg("Only the admin can do this")]
    NotAdmin,
    #[msg("Only the keeper or admin can do this")]
    NotKeeper,
    #[msg("The league is paused")]
    Paused,
    #[msg("Round is not in the right state")]
    BadRound,
    #[msg("Bad round times or parameters")]
    BadTimes,
    #[msg("Entries are closed")]
    EntriesClosed,
    #[msg("Basket must hold 3-10 distinct allowed tokens with weights summing to 10000")]
    BadBasket,
    #[msg("Name must be 1-32 bytes and the buy fee at most 2%")]
    BadName,
    #[msg("Token is not allowed in baskets")]
    TokenNotAllowed,
    #[msg("Wrong vault account")]
    BadVault,
    #[msg("Wrong token account")]
    BadTokenAccount,
    #[msg("No such team in this round")]
    NoSuchTeam,
    #[msg("Team is full")]
    TeamFull,
    #[msg("Too early")]
    TooEarly,
    #[msg("Length mismatch")]
    LengthMismatch,
    #[msg("Settlement does not conserve the round's money")]
    NotConserved,
    #[msg("Season pot would go negative")]
    SeasonOverdrawn,
    #[msg("Payout above the per-entry ceiling")]
    PayoutTooLarge,
    #[msg("Not every entry has a payout yet")]
    SettlementIncomplete,
    #[msg("Entry belongs to another round")]
    WrongRound,
    #[msg("Nothing to claim")]
    NothingToClaim,
    #[msg("Registry is full")]
    RegistryFull,
    #[msg("Amount must be positive")]
    ZeroAmount,
    #[msg("Not enough platform balance")]
    InsufficientBalance,
    #[msg("Arithmetic overflow")]
    Overflow,
}
