export const STARTING_STATE = {
  seed: 100,
  // M6.2 economy bump: more starting grain/wood/cloth so the player has
  // breathing room to build the first round of huts + farm + well + road
  // without immediately starving the wood and cloth supply. Coin stays at
  // 1000 — the housing-tier tax-per-resident boost (HOUSING_TIERS) is what
  // actually fixes the "early tax can't cover upkeep + tribute" death loop.
  resources: {
    grain: 240,
    wood: 220,
    cloth: 40,
    coin: 1000,
    labor: 0
  },
  indicators: {
    morale: 50,
    order: 50,
    prestige: 0
  }
};
