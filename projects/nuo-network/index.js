/*==================================================
  Modules
  ==================================================*/

  const sdk = require('../../sdk');
  const _ = require('underscore');
  const BigNumber = require('bignumber.js');
  const moment = require('moment');

/*==================================================
  Settings
  ==================================================*/

  const tokenAddresses = [
    '0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359', // SAI
    '0x6B175474E89094C44Da98b954EedeAC495271d0F', // DAI
    '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
    '0x0D8775F648430679A709E98d2b0Cb6250d2887EF', // BAT
    '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2', // MKR
    '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', // WBTC
    '0xE41d2489571d322189246DaFA5ebDe1F4699F498', // ZRX
    '0x1985365e9f78359a9B6AD760e32412f4a445E862', // REP
    '0xdd974D5C2e2928deA5F71b9825b8b646686BD200', // KNC
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
    '0x514910771AF9Ca656af840dff83E8264EcF986CA', // LINK
    '0x0000000000085d4780B73119b644AE5ecd22b376'  // TUSD
  ]

  const escrows = [
    "0x802275979B020F0ec871c5eC1db6e412b72fF20b",
    "0xaf38668f4719ecf9452dc0300be3f6c83cbf3721"
  ]

  const reserveAddress = '0x64d14595152b430cf6940da15c6e39545c7c5b7e';

  const abi = {
    lastReserveRuns: {
      "constant":true,
      "inputs":[
        {
          "name":"",
          "type":"address"
        }
      ],
      "name":"lastReserveRuns",
      "outputs":[
        {
          "name":"",
          "type":"uint256"
        }
      ],
      "payable":false,
      "stateMutability":"view",
      "type":"function"
    },
    reserves: {
      "constant":true,
      "inputs":[
        {
          "name":"",
          "type":"uint256"
        },
        {
          "name":"",
          "type":"address"
        }
      ],
      "name":"reserves",
      "outputs":[
        {
          "name":"",
          "type":"uint256"
        }
      ],
      "payable":false,
      "stateMutability":"view",
      "type":"function"
    }
  }

/*==================================================
  Main
  ==================================================*/

  async function run(timestamp, block) {
    let balances = {};

    let calls = [];
    let uCalls = [];

    _.each(escrows, (escrow) => {
      _.each(tokenAddresses, (tokenAddress) => {
        calls.push({
          target: tokenAddress,
          params: escrow
        })
      });
    });

    let balanceOfResults = await sdk.api.abi.multiCall({
      block,
      calls,
      abi: 'erc20:balanceOf'
    });

    _.each(balanceOfResults.output, (balanceOf) => {
      if(balanceOf.success) {
        let address = balanceOf.input.target
        balances[address] = BigNumber(balances[address] || 0).plus(balanceOf.output).toFixed();
      }
    });

    let lastReserveRunsResults = await sdk.api.abi.multiCall({
      block,
      calls: _.map(tokenAddresses, (tokenAddress) => {
        return {
          target: reserveAddress,
          params: tokenAddress
        }
      }),
      abi: abi.lastReserveRuns
    });

    let dayTimestamp = moment.unix(timestamp).utcOffset(0).startOf('day').unix();

    let reservesResults = await sdk.api.abi.multiCall({
      block,
      calls: _.map(lastReserveRunsResults.output, (lastReserveRuns) => {
        let lastUpdate = Number(lastReserveRuns.output);
        return {
          target: lastReserveRuns.input.target,
          params: [String(dayTimestamp > lastUpdate ? lastUpdate : dayTimestamp), lastReserveRuns.input.params[0]]
        }
      }),
      abi: abi.reserves
    });

    _.each(reservesResults.output, (reserves) => {
      if(reserves.success) {
        let address = reserves.input.params[1];
        balances[address] = BigNumber(balances[address] || 0).plus(reserves.output).toFixed();
      }
    });

    let addresses = await sdk.api.abi.call({
      target: '0x4e9d7f37eadc6fef64b5f5dccc4deb6224667677',
      abi:   {
        "constant": true,
        "inputs": [],
        "name": "getAllAccounts",
        "outputs": [
          {
            "name": "",
            "type": "address[]"
          }
        ],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
      },
      block
    });

    _.each(addresses.output, (address) => {
      _.each(tokenAddresses, (tokenAddress) => {
        uCalls.push({
          target: tokenAddress,
          params: address
        })
      });
    });

    uCalls = _.chunk(uCalls, 5000);

    for(let userCalls of uCalls) {
      let actualBalances = await sdk.api.abi.multiCall({
        block,
        calls: userCalls,
        abi: 'erc20:balanceOf'
      });

      _.each(actualBalances.output, (actualBalance) => {
        if(actualBalance.success) {
          let address = actualBalance.input.target
          balances[address] = BigNumber(balances[address] || 0).plus(actualBalance.output).toFixed();
        }
      });
    }

    let symbolBalances = await sdk.api.util.toSymbols(balances);

    return symbolBalances.output;
  }

/*==================================================
  Exports
  ==================================================*/

  module.exports = {
    name: 'Nuo Network',
    token: null,
    category: 'Lending',
    start: 1548115200,  // 01/22/2019 @ 12:00am (UTC)
    run
  }
