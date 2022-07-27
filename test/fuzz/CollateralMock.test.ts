import { expect } from 'chai'
import { ethers } from 'hardhat'
import { BigNumber } from 'ethers'
import { fp } from '../../common/numbers'
import { PriceModelKind, PriceModel } from './common'
import * as sc from '../../typechain' // All smart contract types

describe('CollateralMock', () => {
  let token: sc.ERC20Mock
  let underToken: sc.ERC20Mock

  async function newColl(
    refPerTok: PriceModel,
    targetPerRef: PriceModel,
    uoaPerTarget: PriceModel,
    deviation: PriceModel
  ): Promise<sc.CollateralMock> {
    const f: sc.CollateralMock__factory = await ethers.getContractFactory('CollateralMock')
    return await f.deploy(
      token.address,
      fp(1e6),
      fp(0.05),
      86400,
      underToken.address,
      ethers.utils.formatBytes32String('USD'),
      refPerTok,
      targetPerRef,
      uoaPerTarget,
      deviation
    )
  }

  beforeEach(async () => {
    {
      const f: sc.ERC20Mock__factory = await ethers.getContractFactory('ERC20Mock')
      token = await f.deploy('Collateral Token', 'TK')
      underToken = await f.deploy('Underlying (Base) Token', 'BASE')
    }
  })

  it('combines price models ', async () => {
    const manualPM = {
      kind: PriceModelKind.MANUAL,
      curr: fp(1),
      low: fp(0.1),
      high: fp(10),
    }

    const coll: sc.CollateralMock = await newColl(manualPM, manualPM, manualPM, manualPM)
    expect(await coll.price()).equal(fp(1))
    expect(await coll.refPerTok()).equal(fp(1))
    expect(await coll.targetPerRef()).equal(fp(1))
    expect(await coll.pricePerTarget()).equal(fp(1))

    await coll.update(fp(0.5), fp(3), fp(7), fp(0.1))

    expect(await coll.price()).equal(fp(1.05))
    expect(await coll.refPerTok()).equal(fp(0.5))
    expect(await coll.targetPerRef()).equal(fp(3))
    expect(await coll.pricePerTarget()).equal(fp(7))

    await coll.update(fp(2), fp(3), fp(0.5), fp(0.7))

    expect(await coll.price()).equal(fp(2.1))
    expect(await coll.refPerTok()).equal(fp(2))
    expect(await coll.targetPerRef()).equal(fp(3))
    expect(await coll.pricePerTarget()).equal(fp(0.5))
  })
})