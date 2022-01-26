import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { BigNumber, Wallet } from 'ethers'
import { ethers, waffle } from 'hardhat'
import { BN_SCALE_FACTOR } from '../../common/constants'
import { bn, fp } from '../../common/numbers'
import { AaveLendingPoolMockP0 } from '../../typechain/AaveLendingPoolMockP0'
import { AaveOracle } from '../../typechain/AaveOracle'
import { AssetP0 } from '../../typechain/AssetP0'
import { ATokenCollateralP0 } from '../../typechain/ATokenCollateralP0'
import { CollateralP0 } from '../../typechain/CollateralP0'
import { CompoundOracle } from '../../typechain/CompoundOracle'
import { ComptrollerMockP0 } from '../../typechain/ComptrollerMockP0'
import { CTokenCollateralP0 } from '../../typechain/CTokenCollateralP0'
import { CTokenMock } from '../../typechain/CTokenMock'
import { DeployerP0 } from '../../typechain/DeployerP0'
import { ERC20Mock } from '../../typechain/ERC20Mock'
import { FurnaceP0 } from '../../typechain/FurnaceP0'
import { MainP0 } from '../../typechain/MainP0'
import { MarketMock } from '../../typechain/MarketMock'
import { RevenueTraderP0 } from '../../typechain/RevenueTraderP0'
import { RTokenP0 } from '../../typechain/RTokenP0'
import { StaticATokenMock } from '../../typechain/StaticATokenMock'
import { StRSRP0 } from '../../typechain/StRSRP0'
import { USDCMock } from '../../typechain/USDCMock'
import { advanceTime } from '../utils/time'
import { Collateral, defaultFixture, IConfig, IRevenueShare } from './utils/fixtures'

const createFixtureLoader = waffle.createFixtureLoader

describe('MainP0 contract', () => {
  let owner: SignerWithAddress
  let addr1: SignerWithAddress
  let addr2: SignerWithAddress
  let other: SignerWithAddress

  // Deployer contract
  let deployer: DeployerP0

  // Assets
  let collateral: Collateral[]

  // Non-backing assets
  let rsr: ERC20Mock
  let rsrAsset: AssetP0
  let compAsset: AssetP0
  let compoundMock: ComptrollerMockP0
  let compoundOracle: CompoundOracle
  let aaveToken: ERC20Mock
  let aaveAsset: AssetP0
  let aaveMock: AaveLendingPoolMockP0
  let aaveOracle: AaveOracle

  // Trading
  let market: MarketMock
  let rsrTrader: RevenueTraderP0
  let rTokenTrader: RevenueTraderP0

  // Tokens and Assets
  let initialBal: BigNumber
  let token0: ERC20Mock
  let token1: USDCMock
  let token2: StaticATokenMock
  let token3: CTokenMock
  let collateral0: CollateralP0
  let collateral1: CollateralP0
  let collateral2: ATokenCollateralP0
  let collateral3: CTokenCollateralP0
  let basketReferenceAmounts: BigNumber[]

  // Config values
  let config: IConfig
  let dist: IRevenueShare

  // Contracts to retrieve after deploy
  let rToken: RTokenP0
  let stRSR: StRSRP0
  let furnace: FurnaceP0
  let main: MainP0

  let loadFixture: ReturnType<typeof createFixtureLoader>
  let wallet: Wallet

  before('create fixture loader', async () => {
    ;[wallet] = await (ethers as any).getSigners()
    loadFixture = createFixtureLoader([wallet])
  })

  beforeEach(async () => {
    ;[owner, addr1, addr2, other] = await ethers.getSigners()
    let erc20s: ERC20Mock[]
    let basket: Collateral[]

      // Deploy fixture
    ;({
      rsr,
      rsrAsset,
      aaveToken,
      compAsset,
      aaveAsset,
      compoundOracle,
      aaveOracle,
      compoundMock,
      aaveMock,
      erc20s,
      collateral,
      basket,
      basketReferenceAmounts,
      config,
      deployer,
      dist,
      main,
      rToken,
      furnace,
      stRSR,
      market,
    } = await loadFixture(defaultFixture))
    token0 = erc20s[collateral.indexOf(basket[0])]
    token1 = erc20s[collateral.indexOf(basket[1])]
    token2 = <StaticATokenMock>erc20s[collateral.indexOf(basket[2])]
    token3 = <CTokenMock>erc20s[collateral.indexOf(basket[3])]

    // Set Aave revenue token
    await token2.setAaveToken(aaveToken.address)

    collateral0 = basket[0]
    collateral1 = basket[1]
    collateral2 = <ATokenCollateralP0>basket[2]
    collateral3 = <CTokenCollateralP0>basket[3]

    rsrTrader = <RevenueTraderP0>(
      await ethers.getContractAt('RevenueTraderP0', await main.rsrTrader())
    )
    rTokenTrader = <RevenueTraderP0>(
      await ethers.getContractAt('RevenueTraderP0', await main.rTokenTrader())
    )

    // Mint initial balances
    initialBal = bn('1000000e18')
    await token0.connect(owner).mint(addr1.address, initialBal)
    await token1.connect(owner).mint(addr1.address, initialBal)
    await token2.connect(owner).mint(addr1.address, initialBal)
    await token3.connect(owner).mint(addr1.address, initialBal)

    await token0.connect(owner).mint(addr2.address, initialBal)
    await token1.connect(owner).mint(addr2.address, initialBal)
    await token2.connect(owner).mint(addr2.address, initialBal)
    await token3.connect(owner).mint(addr2.address, initialBal)
  })

  describe('Issuance and Slow Minting', function () {
    const MIN_ISSUANCE_PER_BLOCK = bn('10000e18')

    it('Should not issue RTokens if paused', async function () {
      const issueAmount: BigNumber = bn('10e18')

      // Pause Main
      await main.connect(owner).pause()

      // Try to issue
      await expect(main.connect(addr1).issue(issueAmount)).to.be.revertedWith('paused')

      //Check values
      expect(await rToken.totalSupply()).to.equal(bn(0))
      //expect(await main.issuances(0)).to.be.empty
    })

    it('Should not issue RTokens if amount is zero', async function () {
      const zero: BigNumber = bn('0')

      // Try to issue
      await expect(main.connect(addr1).issue(zero)).to.be.revertedWith('Cannot issue zero')

      //Check values
      expect(await rToken.totalSupply()).to.equal(bn('0'))
      //expect(await vault.basketUnits(main.address)).to.equal(0)
    })

    it('Should revert if user did not provide approval for Token transfer', async function () {
      const issueAmount: BigNumber = bn('10e18')

      await expect(main.connect(addr1).issue(issueAmount)).to.be.revertedWith(
        'ERC20: transfer amount exceeds allowance'
      )
      expect(await rToken.totalSupply()).to.equal(bn(0))
      //expect(await vault.basketUnits(main.address)).to.equal(0)
    })

    it('Should revert if user does not have the required Tokens', async function () {
      const issueAmount: BigNumber = bn('10000000000e18')

      await expect(main.connect(addr1).issue(issueAmount)).to.be.revertedWith(
        'ERC20: transfer amount exceeds balance'
      )
      expect(await rToken.totalSupply()).to.equal(bn('0'))
      //expect(await vault.basketUnits(main.address)).to.equal(0)
    })

    it('Should quote RTokens correctly', async function () {
      // Quote 1 R Token
      const quotes: BigNumber[] = await main.quote(bn('1e18'))

      // Expected quantities
      const expectedQuantities = [bn('2.5e17'), bn('2.5e5'), bn('2.5e17'), bn('2.5e7')]

      expect(quotes[0]).to.equal(basketReferenceAmounts[0].div(BN_SCALE_FACTOR))
      expect(quotes[0]).to.equal(expectedQuantities[0])

      expect(quotes[1]).to.equal(basketReferenceAmounts[1].div(BN_SCALE_FACTOR).div(bn(`1e12`))) // 6 decimals
      expect(quotes[1]).to.equal(expectedQuantities[1])

      expect(quotes[2]).to.equal(basketReferenceAmounts[2].div(BN_SCALE_FACTOR))
      expect(quotes[2]).to.equal(expectedQuantities[2])

      expect(quotes[3]).to.equal(basketReferenceAmounts[3].div(BN_SCALE_FACTOR).div(bn('1e10'))) // 8 decimals
      expect(quotes[3]).to.equal(expectedQuantities[3])
    })

    it('Should issue RTokens with single basket token', async function () {
      const issueAmount: BigNumber = bn('1000e18')

      // Set basket
      await main.connect(owner).setPrimeBasket([collateral[0].address], [fp('1e18')])
      await main.connect(owner).switchBasket()

      // Provide approvals
      await token0.connect(addr1).approve(main.address, initialBal)

      // check balances before
      expect(await token0.balanceOf(main.address)).to.equal(0)
      expect(await token0.balanceOf(addr1.address)).to.equal(initialBal)
      expect(await rToken.balanceOf(main.address)).to.equal(0)

      // Issue rTokens
      await main.connect(addr1).issue(issueAmount)

      // Check Balances after
      expect(await token0.balanceOf(main.address)).to.equal(issueAmount)
      expect(await token0.balanceOf(addr1.address)).to.equal(initialBal.sub(issueAmount))
      expect(await rToken.balanceOf(rToken.address)).to.equal(issueAmount)
      expect(await main.fullyCapitalized()).to.equal(true)

      // Check if minting was registered
      const currentBlockNumber = await ethers.provider.getBlockNumber()
      console.log(await main.issuances(0))
      const [sm_startedAt, sm_amt, sm_minter, sm_availableAt, sm_proc] = await main.issuances(0)
      const blockAddPct: BigNumber = issueAmount.mul(BN_SCALE_FACTOR).div(MIN_ISSUANCE_PER_BLOCK)
      expect(sm_startedAt).to.equal(currentBlockNumber)
      expect(sm_amt).to.equal(issueAmount)
      expect(sm_minter).to.equal(addr1.address)
      expect(sm_availableAt).to.equal(fp(currentBlockNumber).add(blockAddPct))
      expect(sm_proc).to.equal(false)
    })

    it.only('Should issue RTokens correctly for more complex basket multiple users', async function () {
      const issueAmount: BigNumber = bn('1000e18')

      const expectedTkn0: BigNumber = issueAmount
        .mul(await vault.quantity(collateral0.address))
        .div(BN_SCALE_FACTOR)
      const expectedTkn1: BigNumber = issueAmount
        .mul(await vault.quantity(collateral1.address))
        .div(BN_SCALE_FACTOR)
      const expectedTkn2: BigNumber = issueAmount
        .mul(await vault.quantity(collateral2.address))
        .div(BN_SCALE_FACTOR)
      const expectedTkn3: BigNumber = issueAmount
        .mul(await vault.quantity(collateral3.address))
        .div(BN_SCALE_FACTOR)

      // Provide approvals
      await token0.connect(addr1).approve(main.address, initialBal)
      await token1.connect(addr1).approve(main.address, initialBal)
      await token2.connect(addr1).approve(main.address, initialBal)
      await token3.connect(addr1).approve(main.address, initialBal)

      // check balances before
      expect(await token0.balanceOf(vault.address)).to.equal(0)
      expect(await token0.balanceOf(addr1.address)).to.equal(initialBal)

      expect(await token1.balanceOf(vault.address)).to.equal(0)
      expect(await token1.balanceOf(addr1.address)).to.equal(initialBal)

      expect(await token2.balanceOf(vault.address)).to.equal(0)
      expect(await token2.balanceOf(addr1.address)).to.equal(initialBal)

      expect(await token3.balanceOf(vault.address)).to.equal(0)
      expect(await token3.balanceOf(addr1.address)).to.equal(initialBal)

      expect(await rToken.balanceOf(main.address)).to.equal(0)
      expect(await rToken.balanceOf(addr1.address)).to.equal(0)

      // Issue rTokens
      await main.connect(addr1).issue(issueAmount)

      // Check Balances after
      expect(await token0.balanceOf(vault.address)).to.equal(expectedTkn0)
      expect(await token0.balanceOf(addr1.address)).to.equal(initialBal.sub(expectedTkn0))

      expect(await token1.balanceOf(vault.address)).to.equal(expectedTkn1)
      expect(await token1.balanceOf(addr1.address)).to.equal(initialBal.sub(expectedTkn1))

      expect(await token2.balanceOf(vault.address)).to.equal(expectedTkn2)
      expect(await token2.balanceOf(addr1.address)).to.equal(initialBal.sub(expectedTkn2))

      expect(await token3.balanceOf(vault.address)).to.equal(expectedTkn3)
      expect(await token3.balanceOf(addr1.address)).to.equal(initialBal.sub(expectedTkn3))

      expect(await rToken.balanceOf(main.address)).to.equal(issueAmount)
      expect(await rToken.balanceOf(addr1.address)).to.equal(0)

      expect(await vault.basketUnits(main.address)).to.equal(issueAmount)

      // Check if minting was registered
      let currentBlockNumber = await ethers.provider.getBlockNumber()
      let [sm_vault, sm_amt, sm_bu, sm_minter, sm_at, sm_proc] = await main.issuances(0)
      const blockAddPct: BigNumber = issueAmount.mul(BN_SCALE_FACTOR).div(MIN_ISSUANCE_PER_BLOCK)
      expect(sm_vault).to.equal(vault.address)
      expect(sm_amt).to.equal(issueAmount)
      expect(sm_bu).to.equal(issueAmount)
      expect(sm_minter).to.equal(addr1.address)
      expect(sm_at).to.equal(fp(currentBlockNumber).add(blockAddPct))
      expect(sm_proc).to.equal(false)

      // Issue new RTokens with different user
      // This will also process the previous minting and send funds to the minter
      // Provide approvals
      await token0.connect(addr2).approve(main.address, initialBal)
      await token1.connect(addr2).approve(main.address, initialBal)
      await token2.connect(addr2).approve(main.address, initialBal)
      await token3.connect(addr2).approve(main.address, initialBal)
      await main.poke()

      // Check previous minting was processed and funds sent to minter
      ;[, , , , , sm_proc] = await main.issuances(0)
      expect(sm_proc).to.equal(true)
      expect(await rToken.balanceOf(addr1.address)).to.equal(issueAmount)
      expect(await rToken.balanceOf(main.address)).to.equal(0)
      expect(await vault.basketUnits(rToken.address)).to.equal(issueAmount)

      // Issue rTokens
      await main.connect(addr2).issue(issueAmount)

      // Check Balances after
      expect(await token0.balanceOf(vault.address)).to.equal(expectedTkn0.mul(2))
      expect(await token1.balanceOf(vault.address)).to.equal(expectedTkn1.mul(2))
      expect(await token2.balanceOf(vault.address)).to.equal(expectedTkn2.mul(2))
      expect(await token3.balanceOf(vault.address)).to.equal(expectedTkn3.mul(2))
      expect(await rToken.balanceOf(main.address)).to.equal(issueAmount)
      expect(await rToken.balanceOf(addr1.address)).to.equal(issueAmount)
      expect(await rToken.balanceOf(addr2.address)).to.equal(0)

      // Check new issuances was processed
      currentBlockNumber = await ethers.provider.getBlockNumber()
      ;[sm_vault, sm_amt, sm_bu, sm_minter, sm_at, sm_proc] = await main.issuances(1)
      expect(sm_vault).to.equal(vault.address)
      expect(sm_amt).to.equal(issueAmount)
      expect(sm_bu).to.equal(issueAmount)
      expect(sm_minter).to.equal(addr2.address)
      expect(sm_at).to.equal(fp(currentBlockNumber).add(blockAddPct))
      expect(sm_proc).to.equal(false)
    })

    // it('Should process issuances in multiple attempts (using minimum issuance)', async function () {
    // const issueAmount: BigNumber = bn('50000e18')

    // const expectedTkn0: BigNumber = issueAmount
    // .mul(await vault.quantity(collateral0.address))
    // .div(BN_SCALE_FACTOR)
    // const expectedTkn1: BigNumber = issueAmount
    // .mul(await vault.quantity(collateral1.address))
    // .div(BN_SCALE_FACTOR)
    // const expectedTkn2: BigNumber = issueAmount
    // .mul(await vault.quantity(collateral2.address))
    // .div(BN_SCALE_FACTOR)
    // const expectedTkn3: BigNumber = issueAmount
    // .mul(await vault.quantity(collateral3.address))
    // .div(BN_SCALE_FACTOR)

    // // Provide approvals
    // await token0.connect(addr1).approve(main.address, initialBal)
    // await token1.connect(addr1).approve(main.address, initialBal)
    // await token2.connect(addr1).approve(main.address, initialBal)
    // await token3.connect(addr1).approve(main.address, initialBal)

    // // Issue rTokens
    // await main.connect(addr1).issue(issueAmount)

    // // Check Balances after
    // expect(await token0.balanceOf(vault.address)).to.equal(expectedTkn0)
    // expect(await token0.balanceOf(addr1.address)).to.equal(initialBal.sub(expectedTkn0))

    // expect(await token1.balanceOf(vault.address)).to.equal(expectedTkn1)
    // expect(await token1.balanceOf(addr1.address)).to.equal(initialBal.sub(expectedTkn1))

    // expect(await token2.balanceOf(vault.address)).to.equal(expectedTkn2)
    // expect(await token2.balanceOf(addr1.address)).to.equal(initialBal.sub(expectedTkn2))

    // expect(await token3.balanceOf(vault.address)).to.equal(expectedTkn3)
    // expect(await token3.balanceOf(addr1.address)).to.equal(initialBal.sub(expectedTkn3))

    // expect(await rToken.balanceOf(main.address)).to.equal(issueAmount)
    // expect(await vault.basketUnits(main.address)).to.equal(issueAmount)

    // // Check if minting was registered
    // let currentBlockNumber = await ethers.provider.getBlockNumber()
    // let [sm_vault, sm_amt, sm_bu, sm_minter, sm_at, sm_proc] = await main.issuances(0)
    // expect(sm_vault).to.equal(vault.address)
    // expect(sm_amt).to.equal(issueAmount)
    // expect(sm_bu).to.equal(issueAmount)
    // expect(sm_minter).to.equal(addr1.address)
    // expect(sm_at).to.equal(fp(currentBlockNumber + 5))
    // expect(sm_proc).to.equal(false)

    // // Process slow issuances
    // await main.poke()

    // // Check previous minting was not processed
    // ;[, , , , , sm_proc] = await main.issuances(0)
    // expect(sm_proc).to.equal(false)
    // expect(await rToken.balanceOf(addr1.address)).to.equal(0)

    // // Process 4 blocks
    // await advanceToTimestamp((await getLatestBlockTimestamp()) + 1)
    // await advanceToTimestamp((await getLatestBlockTimestamp()) + 1)
    // await advanceToTimestamp((await getLatestBlockTimestamp()) + 1)
    // await main.poke()

    // // Check previous minting was processed and funds sent to minter
    // ;[, , , , , sm_proc] = await main.issuances(0)
    // expect(sm_proc).to.equal(true)
    // expect(await rToken.balanceOf(addr1.address)).to.equal(issueAmount)
    // expect(await vault.basketUnits(main.address)).to.equal(0)
    // expect(await vault.basketUnits(rToken.address)).to.equal(issueAmount)
    // })

    // it('Should process issuances in multiple attempts (using issuanceRate)', async function () {
    // const issueAmount: BigNumber = bn('50000e18')

    // // Provide approvals
    // await token0.connect(addr1).approve(main.address, initialBal)
    // await token1.connect(addr1).approve(main.address, initialBal)
    // await token2.connect(addr1).approve(main.address, initialBal)
    // await token3.connect(addr1).approve(main.address, initialBal)

    // // Issue rTokens
    // await main.connect(addr1).issue(issueAmount)

    // // Process slow issuances
    // await advanceToTimestamp((await getLatestBlockTimestamp()) + 1)
    // await advanceToTimestamp((await getLatestBlockTimestamp()) + 1)
    // await advanceToTimestamp((await getLatestBlockTimestamp()) + 1)
    // await advanceToTimestamp((await getLatestBlockTimestamp()) + 1)
    // await main.poke()

    // // Check issuance was confirmed
    // expect(await rToken.totalSupply()).to.equal(issueAmount)
    // expect(await rToken.balanceOf(addr1.address)).to.equal(issueAmount)
    // expect(await vault.basketUnits(main.address)).to.equal(0)
    // expect(await vault.basketUnits(rToken.address)).to.equal(issueAmount)

    // // Set issuance rate to 50% per block
    // // Set Max auction to 100% and migration chunk to 100% to do it in one single redemption and auction

    // // Update config
    // main.connect(owner).setIssuanceRate(fp('0.5'))

    // // Try new issuance. Should be based on issuance rate = 50% per block should take two blocks
    // // Based on current supply its gonna be 25000e18 tokens per block
    // const ISSUANCE_PER_BLOCK = bn('25000e18')
    // const newIssuanceAmt: BigNumber = bn('30000e18')

    // // Issue rTokens
    // await main.connect(addr1).issue(newIssuanceAmt)

    // // Check if minting was registered
    // let currentBlockNumber = await ethers.provider.getBlockNumber()
    // let [sm_vault, sm_amt, sm_bu, sm_minter, sm_at, sm_proc] = await main.issuances(1)

    // const blockAddPct: BigNumber = newIssuanceAmt.mul(BN_SCALE_FACTOR).div(ISSUANCE_PER_BLOCK)
    // expect(sm_vault).to.equal(vault.address)
    // expect(sm_amt).to.equal(newIssuanceAmt)
    // expect(sm_bu).to.equal(newIssuanceAmt)
    // expect(sm_minter).to.equal(addr1.address)
    // // Using issuance rate of 50% = 2 blocks
    // expect(sm_at).to.equal(fp(currentBlockNumber).add(blockAddPct))
    // expect(sm_proc).to.equal(false)

    // // Process slow issuances
    // await main.poke()

    // // Check previous minting was not processed
    // ;[, , , , , sm_proc] = await main.issuances(1)
    // expect(sm_proc).to.equal(false)
    // expect(await rToken.totalSupply()).to.equal(issueAmount.add(newIssuanceAmt))
    // expect(await vault.basketUnits(main.address)).to.equal(newIssuanceAmt)
    // expect(await vault.basketUnits(rToken.address)).to.equal(issueAmount)
    // expect(await rToken.balanceOf(addr1.address)).to.equal(issueAmount)

    // // Process slow mintings one more time
    // await main.poke()

    // // Check previous minting was processed and funds sent to minter
    // ;[, , , , , sm_proc] = await main.issuances(1)
    // expect(sm_proc).to.equal(true)
    // expect(await rToken.totalSupply()).to.equal(issueAmount.add(newIssuanceAmt))
    // expect(await rToken.balanceOf(addr1.address)).to.equal(issueAmount.add(newIssuanceAmt))
    // expect(await vault.basketUnits(main.address)).to.equal(0)
    // expect(await vault.basketUnits(rToken.address)).to.equal(issueAmount.add(newIssuanceAmt))
    // })

    // it('Should process multiple issuances in the correct order', async function () {
    // // Provide approvals
    // await token0.connect(addr1).approve(main.address, initialBal)
    // await token1.connect(addr1).approve(main.address, initialBal)
    // await token2.connect(addr1).approve(main.address, initialBal)
    // await token3.connect(addr1).approve(main.address, initialBal)

    // // Issuance #1 - Will be processed in 5 blocks
    // const issueAmount: BigNumber = bn('50000e18')
    // await main.connect(addr1).issue(issueAmount)

    // // Issuance #2 and #3 - Will be processed in one additional block each
    // const newIssueAmount: BigNumber = bn('10000e18')
    // await main.connect(addr1).issue(newIssueAmount)
    // await main.connect(addr1).issue(newIssueAmount)

    // // Process remaining 3 blocks for first issuance (2 already processed by issue calls)
    // await advanceToTimestamp((await getLatestBlockTimestamp()) + 1)
    // await advanceToTimestamp((await getLatestBlockTimestamp()) + 1)
    // await main.poke()

    // // Check first slow minting is confirmed
    // expect(await rToken.balanceOf(addr1.address)).to.equal(issueAmount)
    // expect(await vault.basketUnits(main.address)).to.equal(newIssueAmount.mul(2))
    // expect(await vault.basketUnits(rToken.address)).to.equal(issueAmount)

    // // Process another block to get the 2nd issuance processed
    // await main.poke()

    // expect(await rToken.balanceOf(addr1.address)).to.equal(issueAmount.add(newIssueAmount))
    // expect(await vault.basketUnits(main.address)).to.equal(newIssueAmount)
    // expect(await vault.basketUnits(rToken.address)).to.equal(issueAmount.add(newIssueAmount))

    // // Process another block to get the 3rd issuance processed
    // await main.poke()

    // expect(await rToken.balanceOf(addr1.address)).to.equal(issueAmount.add(newIssueAmount.mul(2)))
    // expect(await vault.basketUnits(main.address)).to.equal(0)
    // expect(await vault.basketUnits(rToken.address)).to.equal(
    // issueAmount.add(newIssueAmount.mul(2))
    // )
    // })

    // it('Should rollback mintings if Vault changes (2 blocks)', async function () {
    // const issueAmount: BigNumber = bn('50000e18')

    // const expectedTkn0: BigNumber = issueAmount
    // .mul(await vault.quantity(collateral0.address))
    // .div(BN_SCALE_FACTOR)
    // const expectedTkn1: BigNumber = issueAmount
    // .mul(await vault.quantity(collateral1.address))
    // .div(BN_SCALE_FACTOR)
    // const expectedTkn2: BigNumber = issueAmount
    // .mul(await vault.quantity(collateral2.address))
    // .div(BN_SCALE_FACTOR)
    // const expectedTkn3: BigNumber = issueAmount
    // .mul(await vault.quantity(collateral3.address))
    // .div(BN_SCALE_FACTOR)

    // // Provide approvals
    // await token0.connect(addr1).approve(main.address, initialBal)
    // await token1.connect(addr1).approve(main.address, initialBal)
    // await token2.connect(addr1).approve(main.address, initialBal)
    // await token3.connect(addr1).approve(main.address, initialBal)

    // // Issue rTokens
    // await main.connect(addr1).issue(issueAmount)

    // // Check Balances - Before vault switch
    // expect(await token0.balanceOf(vault.address)).to.equal(expectedTkn0)
    // expect(await token0.balanceOf(addr1.address)).to.equal(initialBal.sub(expectedTkn0))

    // expect(await token1.balanceOf(vault.address)).to.equal(expectedTkn1)
    // expect(await token1.balanceOf(addr1.address)).to.equal(initialBal.sub(expectedTkn1))

    // expect(await token2.balanceOf(vault.address)).to.equal(expectedTkn2)
    // expect(await token2.balanceOf(addr1.address)).to.equal(initialBal.sub(expectedTkn2))

    // expect(await token3.balanceOf(vault.address)).to.equal(expectedTkn3)
    // expect(await token3.balanceOf(addr1.address)).to.equal(initialBal.sub(expectedTkn3))

    // expect(await rToken.balanceOf(main.address)).to.equal(issueAmount)
    // expect(await vault.basketUnits(main.address)).to.equal(issueAmount)

    // // Process slow issuances
    // await main.poke()

    // // Check previous minting was not processed
    // let [, , , , , sm_proc] = await main.issuances(0)
    // expect(sm_proc).to.equal(false)
    // expect(await rToken.balanceOf(addr1.address)).to.equal(0)

    // // Process slow mintings 1 time (still more pending).
    // await main.poke()

    // // Change Vault
    // const newVault: VaultP0 = <VaultP0>(
    // await VaultFactory.deploy([collateral[1].address], [bn('1e18')], [])
    // )
    // expect(await main.connect(owner).switchVault(newVault.address))
    // .to.emit(main, 'IssuanceCanceled')
    // .withArgs(0)

    // // Check Balances after - Funds returned to minter
    // expect(await token0.balanceOf(vault.address)).to.equal(0)
    // expect(await token0.balanceOf(addr1.address)).to.equal(initialBal)

    // expect(await token1.balanceOf(vault.address)).to.equal(0)
    // expect(await token1.balanceOf(addr1.address)).to.equal(initialBal)

    // expect(await token2.balanceOf(vault.address)).to.equal(0)
    // expect(await token2.balanceOf(addr1.address)).to.equal(initialBal)

    // expect(await token3.balanceOf(vault.address)).to.equal(0)
    // expect(await token3.balanceOf(addr1.address)).to.equal(initialBal)

    // expect(await rToken.balanceOf(main.address)).to.equal(0)
    // expect(await vault.basketUnits(main.address)).to.equal(0)
    // ;[, , , , , sm_proc] = await main.issuances(0)
    // expect(sm_proc).to.equal(true)
    // expect(await rToken.balanceOf(addr1.address)).to.equal(0)

    // // Nothing sent to the AssetManager
    // expect(await vault.basketUnits(main.address)).to.equal(0)
    // expect(await newVault.basketUnits(main.address)).to.equal(0)
    // })
    // })

    // describe('Redeem', function () {
    // it('Should revert if zero amount', async function () {
    // const zero: BigNumber = bn('0')
    // await expect(main.connect(addr1).redeem(zero)).to.be.revertedWith('Cannot redeem zero')
    // })

    // it('Should revert if no balance of RToken', async function () {
    // const redeemAmount: BigNumber = bn('1000e18')

    // await expect(main.connect(addr1).redeem(redeemAmount)).to.be.revertedWith(
    // 'ERC20: burn amount exceeds balance'
    // )
    // })

    // context('With issued RTokens', async function () {
    // let issueAmount: BigNumber

    // beforeEach(async function () {
    // // Issue some RTokens to user
    // issueAmount = bn('100e18')
    // // Provide approvals
    // await token0.connect(addr1).approve(main.address, initialBal)
    // await token1.connect(addr1).approve(main.address, initialBal)
    // await token2.connect(addr1).approve(main.address, initialBal)
    // await token3.connect(addr1).approve(main.address, initialBal)

    // // Issue rTokens
    // await main.connect(addr1).issue(issueAmount)

    // // Process the issuance
    // await main.poke()
    // })

    // it('Should redeem RTokens correctly', async function () {
    // const redeemAmount = bn('100e18')

    // // Check balances
    // expect(await rToken.balanceOf(addr1.address)).to.equal(issueAmount)
    // expect(await rToken.totalSupply()).to.equal(issueAmount)
    // expect(await vault.basketUnits(rToken.address)).to.equal(issueAmount)

    // // Redeem rTokens
    // await main.connect(addr1).redeem(redeemAmount)

    // // Check funds were transferred
    // expect(await rToken.balanceOf(addr1.address)).to.equal(0)
    // expect(await rToken.totalSupply()).to.equal(0)

    // expect(await token0.balanceOf(addr1.address)).to.equal(initialBal)
    // expect(await token1.balanceOf(addr1.address)).to.equal(initialBal)
    // expect(await token2.balanceOf(addr1.address)).to.equal(initialBal)
    // expect(await token3.balanceOf(addr1.address)).to.equal(initialBal)
    // })

    // it('Should redeem RTokens correctly for multiple users', async function () {
    // const issueAmount = bn('100e18')
    // const redeemAmount = bn('100e18')

    // //Issue new RTokens
    // await token0.connect(addr2).approve(main.address, initialBal)
    // await token1.connect(addr2).approve(main.address, initialBal)
    // await token2.connect(addr2).approve(main.address, initialBal)
    // await token3.connect(addr2).approve(main.address, initialBal)

    // //Issue rTokens
    // await main.connect(addr2).issue(issueAmount)

    // // Process the issuance
    // await main.poke()

    // // Redeem rTokens
    // await main.connect(addr1).redeem(redeemAmount)

    // // Redeem rTokens with another user
    // await main.connect(addr2).redeem(redeemAmount)

    // // Check funds were transferred
    // expect(await rToken.balanceOf(addr1.address)).to.equal(0)
    // expect(await rToken.balanceOf(addr2.address)).to.equal(0)

    // expect(await rToken.totalSupply()).to.equal(0)

    // expect(await token0.balanceOf(addr1.address)).to.equal(initialBal)
    // expect(await token1.balanceOf(addr1.address)).to.equal(initialBal)
    // expect(await token2.balanceOf(addr1.address)).to.equal(initialBal)
    // expect(await token3.balanceOf(addr1.address)).to.equal(initialBal)

    // expect(await token0.balanceOf(addr2.address)).to.equal(initialBal)
    // expect(await token1.balanceOf(addr2.address)).to.equal(initialBal)
    // expect(await token2.balanceOf(addr2.address)).to.equal(initialBal)
    // expect(await token3.balanceOf(addr2.address)).to.equal(initialBal)
    // })
    // })
  })
})