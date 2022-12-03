// SPDX-License-Identifier: BlueOak-1.0.0
pragma solidity 0.8.9;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../plugins/trading/GnosisTrade.sol";
import "../interfaces/IBroker.sol";
import "../interfaces/IMain.sol";
import "../interfaces/ITrade.sol";
import "../libraries/Fixed.sol";
import "./mixins/Component.sol";

/// A simple core contract that deploys disposable trading contracts for Traders
contract BrokerP0 is ComponentP0, IBroker {
    using FixLib for uint192;
    using EnumerableSet for EnumerableSet.AddressSet;
    using SafeERC20 for IERC20Metadata;

    // The fraction of the supply of the bidding token that is the min bid size in case of default
    uint192 public constant MIN_BID_SHARE_OF_TOTAL_SUPPLY = 1e9; // (1} = 1e-7%
    uint48 public constant MAX_AUCTION_LENGTH = 604800; // {s} max valid duration -1 week

    IGnosis public gnosis;

    mapping(address => bool) private trades;

    uint48 public auctionLength; // {s} the length of an auction

    bool public disabled;

    function init(
        IMain main_,
        IGnosis gnosis_,
        ITrade tradeImplementation_, // Added for Interface compatibility with P1
        uint48 auctionLength_
    ) public initializer {
        require(address(gnosis_) != address(0), "invalid Gnosis address");
        require(
            address(tradeImplementation_) != address(0),
            "invalid Trade Implementation address"
        );
        __Component_init(main_);
        gnosis = gnosis_;
        setAuctionLength(auctionLength_);
    }

    /// Handle a trade request by deploying a customized disposable trading contract
    /// @dev Requires setting an allowance in advance
    /// @custom:protected
    function openTrade(TradeRequest memory req) external notPausedOrFrozen returns (ITrade trade) {
        require(!disabled, "broker disabled");
        assert(req.sellAmount > 0);

        address caller = _msgSender();
        require(
            caller == address(main.backingManager()) ||
                caller == address(main.rsrTrader()) ||
                caller == address(main.rTokenTrader()),
            "only traders"
        );

        trade = _openTrade(req);
        trades[address(trade)] = true;
    }

    function _openTrade(TradeRequest memory req) internal virtual returns (ITrade) {
        // In the future we'll have more sophisticated choice logic here, probably by trade size
        GnosisTrade trade = new GnosisTrade();

        // Apply Gnosis EasyAuction-specific resizing
        req = resizeTrade(req, GNOSIS_MAX_TOKENS);

        req.sell.erc20().safeTransferFrom(_msgSender(), address(trade), req.sellAmount);
        trade.init(this, _msgSender(), gnosis, auctionLength, req);
        return trade;
    }

    /// Disable the broker until re-enabled by governance
    /// @custom:protected
    function reportViolation() external notPausedOrFrozen {
        require(trades[_msgSender()], "unrecognized trade contract");
        emit DisabledSet(disabled, true);
        disabled = true;
    }

    /// @param maxTokensAllowed {qTok} The max number of sell tokens allowed by the trading platform
    function resizeTrade(TradeRequest memory req, uint256 maxTokensAllowed)
        private
        pure
        returns (TradeRequest memory)
    {
        // {qTok}
        uint256 maxQuantity = (req.minBuyAmount > req.sellAmount)
            ? req.minBuyAmount
            : req.sellAmount;

        // Set both sellAmount and minBuyAmount <= maxTokensAllowed
        if (maxQuantity > maxTokensAllowed) {
            req.sellAmount = mulDiv256(req.sellAmount, maxTokensAllowed, maxQuantity, CEIL);
            req.minBuyAmount = mulDiv256(req.minBuyAmount, maxTokensAllowed, maxQuantity, FLOOR);
        }

        return req;
    }

    // === Setters ===

    /// @custom:governance
    function setAuctionLength(uint48 newAuctionLength) public governance {
        require(
            newAuctionLength > 0 && newAuctionLength <= MAX_AUCTION_LENGTH,
            "invalid auctionLength"
        );
        emit AuctionLengthSet(auctionLength, newAuctionLength);
        auctionLength = newAuctionLength;
    }

    /// @custom:governance
    function setDisabled(bool disabled_) external governance {
        emit DisabledSet(disabled, disabled_);
        disabled = disabled_;
    }
}
