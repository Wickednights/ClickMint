import { parseAbi } from "viem";

export const clickMintGameAbi = parseAbi([
  "function deposit() payable",
  "function click()",
  "function clickToken() view returns (address)",
  "function clickCostCredits() view returns (uint256)",
  "function baseClickReward() view returns (uint256)",
  "function totalClicksInHour(uint256 hourId) view returns (uint256)",
  "function credits(address user) view returns (uint256)",
  "function currentPotEth() view returns (uint256)",
  "function gameHour(uint256 ts) view returns (uint256)",
  "function hourWinner(uint256 hourId) view returns (address)",
  "function hourPayout(uint256 hourId) view returns (uint256)",
  "function hourFinalized(uint256 hourId) view returns (bool)",
  "function hourWinWindow(uint256 hourId) view returns (uint8)",
  "function finalizeHour(uint256 hourId)",
  "event Deposited(address indexed user, uint256 ethIn, uint256 creditsOut)",
  "event Clicked(address indexed user, uint256 hourId, uint256 totalForUserHour, uint8 window)",
  "event PotWin(uint256 indexed hourId, address indexed winner, uint256 clickPayout, uint8 window, bytes32 entropy)",
]);

export const binaryTrophyAbi = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);

export const clickTokenAbi = parseAbi([
  "function game() view returns (address)",
  "function claimVested()",
  "function earlySpendPending(uint256 amount)",
  "function claimable(address account) view returns (uint256)",
  "function pendingVested(address account) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);
