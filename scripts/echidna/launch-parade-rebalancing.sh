nice echidna-parade protocol --name parade --contract $1 --config protocol/tools/echidna.config.yml  --ncores 4 --timeout -1 --gen_time 1800 --initial_time 3600 --minseqLen 10 --maxseqLen 100 --clean-results --prob 0.8 --always "RebalancingScenario.issue(uint256)" "RebalancingScenario.issueTo(uint256,uint8)" "RebalancingScenario.refreshBasket()" "RebalancingScenario.settleTrades()" "RebalancingScenario.manageBackingTokens()"