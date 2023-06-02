import { BigNumberish } from 'ethers'
import {
  ConvexStakingWrapper,
  CurvePoolMock,
  ERC20Mock,
  RewardableERC20Vault,
  MockV3Aggregator,
  TestICollateral,
} from '../../../../typechain'
import { CollateralOpts } from '../pluginTestTypes'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { CurvePoolType } from './constants'

type Fixture<T> = () => Promise<T>

export interface CurveBase {
  curvePool: CurvePoolMock
  wrapper: RewardableERC20Vault | ConvexStakingWrapper
}

// The basic fixture context used in the Curve collateral plugin tests
export interface CurveCollateralFixtureContext extends CurveBase {
  alice: SignerWithAddress
  collateral: TestICollateral
  rewardTokens: ERC20Mock[] // ie [CRV, CVX, FXS]
  poolTokens: ERC20Mock[] // ie [USDC, DAI, USDT]
  feeds: MockV3Aggregator[] // ie [USDC/USD feed, DAI/USD feed, USDT/USD feed]
}

// The basic constructor arguments for a Curve collateral plugin -- extension
export interface CurveCollateralOpts extends CollateralOpts {
  nTokens?: BigNumberish
  curvePool?: string
  poolType?: CurvePoolType
  feeds?: string[][]
  oracleTimeouts?: BigNumberish[][]
  oracleErrors?: BigNumberish[][]
  lpToken?: string
}

// A function to deploy the collateral plugin and return the deployed instance of the contract
export type DeployCurveCollateralFunc = (opts: CurveCollateralOpts) => Promise<TestICollateral>

// A function to deploy and return the plugin-specific test suite context
export type MakeCurveCollateralFixtureFunc<T extends CurveCollateralFixtureContext> = (
  alice: SignerWithAddress,
  opts: CurveCollateralOpts
) => Fixture<T>

// A function to mint a certain amount of collateral to a target address
export type MintCurveCollateralFunc<T extends CurveCollateralFixtureContext> = (
  ctx: CurveCollateralFixtureContext,
  amount: BigNumberish,
  user: SignerWithAddress,
  recipient: string
) => Promise<void>

// The interface that defines the test suite for the collateral plugin
export interface CurveCollateralTestSuiteFixtures<T extends CurveCollateralFixtureContext> {
  // a function to deploy the collateral plugin and return the deployed instance of the contract
  deployCollateral: DeployCurveCollateralFunc

  // a group of tests, specific to the collateral plugin, focused on the plugin's constructor
  collateralSpecificConstructorTests: () => void

  // a group of tests, specific to the collateral plugin, focused on status checks
  collateralSpecificStatusTests: () => void

  // a function to deploy and return the plugin-specific test suite context
  makeCollateralFixtureContext: MakeCurveCollateralFixtureFunc<T>

  // a function to mint a certain amount of collateral to a target address
  mintCollateralTo: MintCurveCollateralFunc<T>

  isMetapool: boolean

  // a function to reset the fork to a desired block
  resetFork: () => void

  // the name of the collateral plugin being tested
  collateralName: string
}
