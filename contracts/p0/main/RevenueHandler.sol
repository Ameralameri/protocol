// SPDX-License-Identifier: BlueOak-1.0.0
pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "contracts/p0/assets/collateral/ATokenCollateral.sol";
import "contracts/p0/libraries/Oracle.sol";
import "contracts/p0/main/RevenueDistributor.sol";
import "contracts/p0/main/SettingsHandler.sol";
import "contracts/p0/main/VaultHandler.sol";
import "contracts/p0/main/Moody.sol";
import "contracts/p0/main/Mixin.sol";
import "contracts/p0/interfaces/IAsset.sol";
import "contracts/p0/interfaces/IMain.sol";
import "contracts/p0/interfaces/IVault.sol";
import "contracts/libraries/Fixed.sol";
import "contracts/Pausable.sol";
import "./Auctioneer.sol";
import "./Moody.sol";
import "./SettingsHandler.sol";
import "./VaultHandler.sol";

/**
 * @title RevenueHandler
 * @notice Handles claiming of rewards from other protocols.
 */
contract RevenueHandlerP0 is
    Pausable,
    Mixin,
    MoodyP0,
    SettingsHandlerP0,
    RevenueDistributorP0,
    VaultHandlerP0,
    AuctioneerP0,
    IRevenueHandler
{
    using EnumerableSet for EnumerableSet.AddressSet;
    using SafeERC20 for IERC20;
    using FixLib for Fix;

    uint256 private _rewardsLastClaimed;

    function init(ConstructorArgs calldata args)
        public
        virtual
        override(Mixin, SettingsHandlerP0, RevenueDistributorP0, VaultHandlerP0, AuctioneerP0)
    {
        super.init(args);
    }

    /// Collects revenue by expanding RToken supply and claiming COMP/AAVE rewards
    function poke() public virtual override(Mixin, AuctioneerP0) notPaused {
        super.poke();
        (uint256 prevRewards, ) = _rewardsAdjacent(block.timestamp);
        if (prevRewards > _rewardsLastClaimed && fullyCapitalized()) {
            // Sweep COMP/AAVE from vaults + traders into Main
            backingTrader.claimAndSweepRewards();
            rsrStakingTrader.claimAndSweepRewards();
            rTokenMeltingTrader.claimAndSweepRewards();
            for (uint256 i = 0; i < vaults.length; i++) {
                vaults[i].claimAndSweepRewards();
            }

            _rewardsLastClaimed = prevRewards;
        }

        _splitRewardsToTraders(compAsset());
        _splitRewardsToTraders(aaveAsset());
    }

    function beforeUpdate()
        public
        virtual
        override(Mixin, SettingsHandlerP0, RevenueDistributorP0, VaultHandlerP0, AuctioneerP0)
    {
        super.beforeUpdate();
    }

    /// @return The timestamp of the next rewards event
    function nextRewards() public view override returns (uint256) {
        (, uint256 next) = _rewardsAdjacent(block.timestamp);
        return next;
    }

    function _expandSupplyToRTokenTrader() internal {
        // Expand the RToken supply to self
        uint256 possible = fromBUs(vault().basketUnits(address(this)));
        uint256 totalSupply = rToken().totalSupply();
        if (fullyCapitalized() && possible > totalSupply) {
            rToken().mint(address(rTokenMeltingTrader), possible - totalSupply);
        }
    }

    /// Splits `asset` into `cut` and `1-cut` proportions, and sends to revenue traders
    function _splitRewardsToTraders(IAsset asset) private {
        uint256 bal = asset.erc20().balanceOf(address(this));
        if (bal > 0) {
            uint256 amtToRSR = rsrCut().mulu(bal).toUint();
            asset.erc20().safeTransfer(address(rsrStakingTrader), amtToRSR); // cut
            asset.erc20().safeTransfer(address(rTokenMeltingTrader), bal - amtToRSR); // 1 - cut
        }
    }

    // Returns the rewards boundaries on either side of *time*.
    function _rewardsAdjacent(uint256 time) private view returns (uint256 left, uint256 right) {
        int256 reps = (int256(time) - int256(rewardStart())) / int256(rewardPeriod());
        left = uint256(reps * int256(rewardPeriod()) + int256(rewardStart()));
        right = left + rewardPeriod();
    }
}