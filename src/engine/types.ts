// Thuruppu Game Engine — Core Types

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '7' | '8' | 'Q' | 'K' | '10' | 'A' | '9' | 'J';
export type PlayerIndex = 0 | 1 | 2 | 3;
export type TeamIndex = 0 | 1;
export type Phase = 'dealing' | 'bidding' | 'selectingTrump' | 'rebidding' | 'firstPhase' | 'secondPhase' | 'scoring' | 'finished';

export interface Card {
  suit: Suit;
  rank: Rank;
}

export interface TrickCard {
  card: Card;
  player: PlayerIndex;
}

export interface Trick {
  cards: TrickCard[];
  winner: PlayerIndex;
  points: number;
  leadSuit: Suit;              // suit that was led for this trick
}

export interface BidRecord {
  player: PlayerIndex;
  amount?: number;
  pass: boolean;
}

export interface GameState {
  phase: Phase;
  hands: [Card[], Card[], Card[], Card[]];
  currentPlayer: PlayerIndex;
  dealer: PlayerIndex;
  remainingDeck: Card[];                         // undealt cards for second deal
  tricks: Trick[];
  currentTrick: { cards: (TrickCard | null)[]; leadSuit: Suit | null };
  trumpSuit: Suit | null;
  hiddenTrumpCard: Card | null;                  // face-down trump — still IN bidder's hand
  trumpCard: Card | null;                        // the trump card itself — persists even after played
  trumpRevealed: boolean;
  changingTrump: boolean;                        // bidder may change trump after raising rebid
  preRebidBid: number | null;                    // bid amount before the rebid phase
  mustPlayTrump: boolean;                        // trump caller must now play a trump (if held)
  bid: { amount: number; bidder: PlayerIndex } | null;
  bidHistory: BidRecord[];
  rebidPlayers: PlayerIndex[];                   // players who may still rebid (24+ after 8-card deal)
  bidderPairShown: boolean;                      // bidder's team showed K+Q of trump
  defenderPairShown: boolean;                    // defender's team showed K+Q of trump
  scores: { team0: number; team1: number };
  roundComplete: boolean;
  roundResult: {
    biddingTeamWon: boolean;
    bidAmount: number;
    biddingTeamPoints: number;
    defendingTeamPoints: number;
    pointsChange: number;   // game points the bidding team gains (+) or loses (−), per bid bracket
  } | null;
  winner: TeamIndex | null;
  trickNumber: number;
  trumpLedThisTrick: boolean;                    // has trump been played in the current trick?
  passesSinceLastBid: number;
}

export type LegalMove =
  | { type: 'bid'; amount: number }
  | { type: 'pass' }
  | { type: 'selectTrump'; card: Card }
  | { type: 'keepTrump' }
  | { type: 'playCard'; card: Card }
  | { type: 'callTrump' }
  | { type: 'showPair' }
  | { type: 'nextRound' }
  | { type: 'redeal' };
export interface PlayerViewState {
  phase: Phase;
  playerIndex: PlayerIndex;
  teamIndex: TeamIndex;
  hand: Card[];
  partnerHandCount: number;
  opponentHandCounts: [number, number];
  currentPlayer: PlayerIndex;
  dealer: PlayerIndex;
  tricks: Trick[];
  currentTrick: { cards: (TrickCard | null)[]; leadSuit: Suit | null };
  trumpSuit: Suit | null;
  trumpRevealed: boolean;
  trumpCard: Card | null;                        // the trump card — persists even after played
  changingTrump: boolean;                        // bidder may change trump after raising rebid
  bid: { amount: number; bidder: PlayerIndex } | null;
  bidHistory: BidRecord[];
  rebidPlayers: PlayerIndex[];
  bidderPairShown: boolean;
  defenderPairShown: boolean;
  scores: { team0: number; team1: number };
  trickNumber: number;
  hiddenTrumpCard: Card | null;                  // visible only to the bidder
  allowConcede: boolean;                         // whether early-concede is enabled
  roundDecided: { decided: boolean; winner: TeamIndex | null; reason: string } | null;
  roundComplete: boolean;
  roundResult: GameState['roundResult'];
  winner: TeamIndex | null;
  legalMoves: LegalMove[];
}
