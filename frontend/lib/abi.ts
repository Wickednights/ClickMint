import { parseAbi } from "viem";

export const clickMintGameAbi = parseAbi([
  "function deposit() payable",
  "function depositFor(address player) payable",
  "function click()",
  "function clickFor(address player)",
  "function setClickExecutor(address executor)",
  "function clickExecutor(address player) view returns (address)",
  "event ClickExecutorSet(address indexed player, address indexed executor)",
  "function clickToken() view returns (address)",
  "function clickCostCredits() view returns (uint256)",
  "function baseClickReward() view returns (uint256)",
  "function clicksPerHashTier() view returns (uint256)",
  "function minPotClicks() view returns (uint256)",
  "function totalClicksInHour(uint256 hourId) view returns (uint256)",
  "function credits(address user) view returns (uint256)",
  "function currentPotEth() view returns (uint256)",
  "function potCarry() view returns (uint256)",
  "function potEthByHour(uint256 hourId) view returns (uint256)",
  "function gameHour(uint256 ts) view returns (uint256)",
  "function hourWinner(uint256 hourId) view returns (address)",
  "function hourPayout(uint256 hourId) view returns (uint256)",
  "function hourFinalized(uint256 hourId) view returns (bool)",
  "function hourWinWindow(uint256 hourId) view returns (uint8)",
  "function minuteOfUtcHour(uint256 ts) pure returns (uint8)",
  "function trophyDropBps() view returns (uint256)",
  "function setTrophyDropBps(uint256 bps)",
  "function potKeeper() view returns (address)",
  "function setPotKeeper(address k)",
  "function finalizeHour(uint256 hourId)",
  "event Deposited(address indexed user, uint256 ethIn, uint256 creditsOut)",
  "event Clicked(address indexed user, uint256 hourId, uint256 totalForUserHour, uint8 minute)",
  "event PotWin(uint256 indexed hourId, address indexed winner, uint256 ethPayout, uint8 winStartMinute, bytes32 entropy)",
]);

export const binaryTrophyAbi = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "event TrophyMinted(address indexed to, uint256 indexed tokenId, uint64 totalClicks, uint8 fragmentSlot, bool viaGame)",
  "function approve(address to, uint256 tokenId)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
]);

export const escrowAbi = parseAbi([
  "function deposit(address token, uint256 tokenId, address beneficiary) returns (uint256)",
  "function claim(uint256 holdId)",
  "function nextHoldId() view returns (uint256)",
  "function holds(uint256 holdId) view returns (address token, uint256 tokenId, address depositor, address beneficiary, bool released)",
]);

export const clickTokenAbi = parseAbi([
  "function owner() view returns (address)",
  "function maxSupply() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function game() view returns (address)",
  "function claimVested()",
  "function earlySpendPending(uint256 amount)",
  "function claimable(address account) view returns (uint256)",
  "function pendingVested(address account) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function mintForTestingEnabled() view returns (bool)",
  "function mintForTesting(address to, uint256 amount)",
  "event TestingMint(address indexed to, uint256 amount)",
  "event InitialLpBootstrapMint(address indexed to, uint256 amount)",
]);
