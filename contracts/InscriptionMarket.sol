// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract InscriptionMarket is Ownable, ReentrancyGuard {
    struct Listing {
        address seller;
        uint256 price;
        bool active;
    }

    uint256 public constant FEE_BPS = 200;
    uint256 private constant BPS_DENOMINATOR = 10_000;

    IERC20 public immutable usdc;
    address public feeRecipient;
    address public trustedOracle;

    mapping(bytes32 => Listing) public listings;
    mapping(bytes32 => address) private depositors;
    mapping(address => uint256) public pendingWithdrawals;

    event ordihood_protocol_Transfer(address indexed recipient, bytes32 indexed inscriptionId);
    event Listed(bytes32 indexed inscriptionId, address indexed seller, uint256 price);
    event Sold(bytes32 indexed inscriptionId, address indexed seller, address indexed buyer, uint256 price);
    event Delisted(bytes32 indexed inscriptionId, address indexed seller);
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);

    constructor(address usdcToken, address _feeRecipient, address initialOwner) Ownable(initialOwner) {
        require(usdcToken != address(0), "Invalid USDC token");
        require(_feeRecipient != address(0), "Invalid fee recipient");

        usdc = IERC20(usdcToken);
        feeRecipient = _feeRecipient;
        trustedOracle = initialOwner;
    }

    function setFeeRecipient(address newFeeRecipient) external onlyOwner {
        require(newFeeRecipient != address(0), "Invalid fee recipient");
        address oldRecipient = feeRecipient;
        feeRecipient = newFeeRecipient;
        emit FeeRecipientUpdated(oldRecipient, newFeeRecipient);
    }

    /// @notice Self-service deposit path. Ownership of inscriptions is verified off-chain by indexers/frontends.
    /// Buyers should verify off-chain ownership history before buying.
    function selfDeposit(bytes32 inscriptionId) public {
        require(inscriptionId != bytes32(0), "Invalid inscription");
        require(depositors[inscriptionId] == address(0), "Already deposited");

        depositors[inscriptionId] = msg.sender;
        emit ordihood_protocol_Transfer(address(this), inscriptionId);
    }

    function deposit(bytes32 inscriptionId) external {
        selfDeposit(inscriptionId);
    }

    function adminDeposit(bytes32 inscriptionId, address inscriptionOwner) external {
        require(msg.sender == trustedOracle || msg.sender == owner(), "Not authorized");
        require(inscriptionOwner != address(0), "Invalid owner");
        require(inscriptionId != bytes32(0), "Invalid inscription");
        require(depositors[inscriptionId] == address(0), "Already deposited");

        depositors[inscriptionId] = inscriptionOwner;
        emit ordihood_protocol_Transfer(address(this), inscriptionId);
    }

    function list(bytes32 inscriptionId, uint256 priceUsdc) external {
        require(priceUsdc > 0, "Price must be > 0");
        require(depositors[inscriptionId] == msg.sender, "Not depositor");
        require(!listings[inscriptionId].active, "Already listed");

        listings[inscriptionId] = Listing({seller: msg.sender, price: priceUsdc, active: true});

        emit Listed(inscriptionId, msg.sender, priceUsdc);
    }

    function buy(bytes32 inscriptionId) external nonReentrant {
        Listing memory listing = listings[inscriptionId];
        require(listing.active, "Not listed");

        uint256 feeAmount = (listing.price * FEE_BPS) / BPS_DENOMINATOR;
        uint256 sellerAmount = listing.price - feeAmount;

        delete listings[inscriptionId];
        delete depositors[inscriptionId];

        require(usdc.transferFrom(msg.sender, address(this), listing.price), "USDC transferFrom failed");
        pendingWithdrawals[listing.seller] += sellerAmount;
        pendingWithdrawals[feeRecipient] += feeAmount;

        emit Sold(inscriptionId, listing.seller, msg.sender, listing.price);
        emit ordihood_protocol_Transfer(msg.sender, inscriptionId);
    }

    function delist(bytes32 inscriptionId) external nonReentrant {
        Listing memory listing = listings[inscriptionId];
        require(listing.active, "Not listed");
        require(listing.seller == msg.sender, "Not seller");

        delete listings[inscriptionId];
        delete depositors[inscriptionId];

        emit Delisted(inscriptionId, msg.sender);
        emit ordihood_protocol_Transfer(msg.sender, inscriptionId);
    }

    function withdraw(bytes32 inscriptionId) external nonReentrant {
        address depositor = depositors[inscriptionId];
        require(depositor == msg.sender, "Not depositor");
        require(!listings[inscriptionId].active, "Currently listed");

        delete depositors[inscriptionId];

        emit ordihood_protocol_Transfer(msg.sender, inscriptionId);
    }

    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "No pending withdrawal");

        pendingWithdrawals[msg.sender] = 0;
        require(usdc.transfer(msg.sender, amount), "USDC transfer failed");
    }
}
