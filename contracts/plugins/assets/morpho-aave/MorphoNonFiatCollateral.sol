// SPDX-License-Identifier: BlueOak-1.0.0
pragma solidity 0.8.19;

import { CollateralConfig, MorphoFiatCollateral } from "./MorphoFiatCollateral.sol";
import { FixLib, CEIL } from "../../../libraries/Fixed.sol";
import { OracleLib } from "../OracleLib.sol";
// solhint-disable-next-line max-line-length
import { AggregatorV3Interface } from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

/**
 * @title MorphoNonFiatCollateral
 * @notice Collateral plugin for a Morpho pool with non-fiat collateral, like WBTC
 * Expected: {tok} != {ref}, {ref} is pegged to {target} unless defaulting, {target} != {UoA}
 */
contract MorphoNonFiatCollateral is MorphoFiatCollateral {
    using OracleLib for AggregatorV3Interface;
    using FixLib for uint192;

    AggregatorV3Interface public immutable targetUnitChainlinkFeed; // {target/ref}
    uint48 public immutable targetUnitOracleTimeout; // {s}

    /// @param config Configuration of this collateral.
    /// config.erc20 must be a MorphoTokenisedDeposit
    /// @param revenueHiding {1} A value like 1e-6 that represents the maximum refPerTok to hide
    /// @param targetUnitChainlinkFeed_ Feed units: {target/ref}
    /// @param targetUnitOracleTimeout_ {s} oracle timeout to use for targetUnitChainlinkFeed
    constructor(
        CollateralConfig memory config,
        uint192 revenueHiding,
        AggregatorV3Interface targetUnitChainlinkFeed_,
        uint48 targetUnitOracleTimeout_
    ) MorphoFiatCollateral(config, revenueHiding) {
        targetUnitChainlinkFeed = targetUnitChainlinkFeed_;
        targetUnitOracleTimeout = targetUnitOracleTimeout_;
    }

    /// Can revert, used by other contract functions in order to catch errors
    /// @return low {UoA/tok} The low price estimate
    /// @return high {UoA/tok} The high price estimate
    /// @return pegPrice {target/ref} The actual price observed in the peg
    function tryPrice()
        external
        view
        override
        returns (
            uint192 low,
            uint192 high,
            uint192 pegPrice
        )
    {
        // {tar/ref} Get current market peg ({btc/wbtc})
        pegPrice = targetUnitChainlinkFeed.price(targetUnitOracleTimeout);

        // {UoA/tok} = {UoA/ref} * {ref/tok}
        uint192 p = chainlinkFeed.price(oracleTimeout).mul(_underlyingRefPerTok());
        uint192 err = p.mul(oracleError, CEIL);

        high = p + err;
        low = p - err;
        // assert(low <= high); obviously true just by inspection
    }
}
