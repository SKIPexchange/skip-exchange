import { Injectable } from '@angular/core';
import { get } from 'lodash';
import { environment } from 'src/environments/environment';
import {
  ApproveParams,
  estimateDefaultFeesWithGasPricesAndLimits,
  ETHAddress,
  getTokenAddress,
  TxOverrides,
} from '@xchainjs/xchain-ethereum/lib';
import { User } from '../_classes/user';
import { BigNumber } from '@ethersproject/bignumber';
import { ethers } from 'ethers';
import { erc20ABI } from '../_abi/erc20.abi';
import { AssetETH, AssetRuneNative, assetToString } from '@xchainjs/xchain-util';
import { toUtf8Bytes } from '@ethersproject/strings';
import { Address } from '@xchainjs/xchain-client';
import { hexlify } from '@ethersproject/bytes';
import { MockClientService } from './mock-client.service';
import { BehaviorSubject } from 'rxjs';
import { UserService } from './user.service';
import { take } from 'rxjs/operators';
import { TransactionResponse } from '@ethersproject/abstract-provider';

declare global {
  interface Window {
    xfi: any;
    ethereum: any;
  }
}
@Injectable({
  providedIn: 'root',
})
export class XDEFIService {
  public static listProvider = [
    {
      title: 'Ethereum Provider',
      providerPath: 'ethereum',
      enabled: true,
      disableNetworkValidation: true,
    },
    {
      title: 'Bitcoin Provider',
      providerPath: ['xfi', 'bitcoin'],
      enabled: true,
    },
    {
      title: 'BinanceDEX Provider',
      providerPath: ['xfi', 'binance'],
      enabled: true,
    },
    {
      title: 'BitcoinCash Provider',
      providerPath: ['xfi', 'bitcoincash'],
      enabled: true,
    },
    {
      title: 'LiteCoin Provider',
      providerPath: ['xfi', 'litecoin'],
      enabled: true,
    },
    {
      title: 'Thorchain Provider',
      providerPath: ['xfi', 'thorchain'],
      enabled: true,
    },
  ];

  private vaildNetwork = new BehaviorSubject<boolean>(this.isValidNetwork());
  validNetwork$ = this.vaildNetwork.asObservable();

  constructor(
    private userService: UserService,
    private mockClientService: MockClientService
  ) {
    try {
      if (typeof window === 'object' && window?.xfi) {
        (window as any)?.xfi?.thorchain?.on('chainChanged', (obj) => {
          console.log('changed', obj);
          const envNetwork =
            environment.network === 'testnet' ? 'testnet' : 'mainnet';
          this.vaildNetwork.next(this.isValidNetwork());
          if (obj.network !== envNetwork) {
            // let changeUrl = envNetwork === 'testnet' ? links.appUrl : links.testnetAppUrl;
            // location.href = changeUrl;
          }
        });

        (window as any)?.ethereum?.on('accountsChanged', (accounts) => {
          // Time to reload your interface with accounts[0]!
          this.userService.user$.pipe(take(1)).subscribe((user) => {
            if (user) {
              this.connectXDEFI().then((user) => {
                console.log('new user account', user);
                if (user) this.userService.setUser(user);
              });
            }
          });
        });
      }
    } catch (error) {
      console.error("couldn't find the xdefi injections!");
    }
  }

  isValidNetwork() {
    const invalidNetworkProvider = XDEFIService.listProvider.find(
      ({ providerPath, disableNetworkValidation }) => {
        const providerInfo = get(window, providerPath);
        if (disableNetworkValidation || !providerInfo) {
          return false;
        }
        const projectNetwork =
          environment.network === 'testnet' ? 'testnet' : 'mainnet';
        return projectNetwork !== providerInfo.network;
      }
    );
    return !invalidNetworkProvider;
  }

  //isn't being used atm
  providerIsEmpty(value) {
    return Object.keys(value).length === 0 && value?.constructor === Object;
  }

  checkTheProviders(provider) {
    return get(window, provider.providerPath);
  }

  listEnabledXDFIProviders() {
    return XDEFIService.listProvider.map((provider) => ({
      ...provider,
      // @ts-ignore
      enabled: this.checkTheProviders(provider),
    }));
  }

  async initXDEFI() {}

  async getBnbAddress(): Promise<string> {
    if (!(window as any).xfi.binance) {
      return;
    }
    return new Promise((resolve, reject) => {
      (window as any).xfi.binance.request(
        {
          method: 'request_accounts',
          params: [],
        },
        (err, accounts) => {
          if (err) {
            return reject(err);
          }
          return resolve(accounts[0]);
        }
      );
    });
  }

  async getBtcAddress(): Promise<string> {
    if (!(window as any).xfi.bitcoin) {
      return;
    }
    return new Promise((resolve, reject) => {
      (window as any).xfi.bitcoin.request(
        {
          method: 'request_accounts',
          params: [],
        },
        (err, accounts) => {
          if (err) {
            return reject(err);
          }
          return resolve(accounts[0]);
        }
      );
    });
  }

  async getBchAddress(): Promise<string> {
    if (!(window as any).xfi.bitcoincash) {
      return;
    }
    return new Promise((resolve, reject) => {
      (window as any).xfi.bitcoincash.request(
        {
          method: 'request_accounts',
          params: [],
        },
        (err, accounts) => {
          if (err) {
            return reject(err);
          }
          return resolve(accounts[0]);
        }
      );
    });
  }

  async getEthAddress(): Promise<string> {
    if (!(window as any).ethereum) {
      return;
    }
    const provider = new ethers.providers.Web3Provider(window.ethereum)
    return await provider.send("eth_requestAccounts", []);
  }

  async getThorChainAddress(): Promise<string> {
    if (!(window as any).xfi.thorchain) {
      return;
    }
    return new Promise((resolve, reject) => {
      (window as any).xfi.thorchain.request(
        {
          method: 'request_accounts',
          params: [],
        },
        (err, accounts) => {
          if (err) {
            return reject(err);
          }
          return resolve(accounts[0]);
        }
      );
    });
  }

  async getLtcAddress(): Promise<string> {
    if (!(window as any).xfi.litecoin) {
      return;
    }
    return new Promise((resolve, reject) => {
      (window as any).xfi.litecoin.request(
        {
          method: 'request_accounts',
          params: [],
        },
        (err, accounts) => {
          if (err) {
            return reject(err);
          }
          return resolve(accounts[0]);
        }
      );
    });
  }

  async connectXDEFI() {
    const userBinanceClient = this.mockClientService.mockBinanceClient;
    const userBtcClient = this.mockClientService.mockBtcClient;
    const userThorchainClient = this.mockClientService.mockThorchainClient;
    const userEthereumClient = this.mockClientService.mockEthereumClient;
    const userLtcClient = this.mockClientService.mockLtcClient;
    const userbchClient = this.mockClientService.mockBchClient;
    const [thorAddress] = await Promise.all([
      this.getThorChainAddress(),
      new Promise((resolve) => setTimeout(resolve, 100)),
    ]);
    const [bnbAddress, btcAddress, bchAddress, ethAddresses, ltcAddress] =
      await Promise.all([
        this.getBnbAddress(),
        this.getBtcAddress(),
        this.getBchAddress(),
        this.getEthAddress(),
        this.getLtcAddress(),
      ]);

    userThorchainClient.getAddress = () => thorAddress;
    userBinanceClient.getAddress = () => bnbAddress;
    userBtcClient.getAddress = () => btcAddress;
    userbchClient.getAddress = () => bchAddress;
    userEthereumClient.getAddress = () => ethAddresses?.[0];
    userLtcClient.getAddress = () => ltcAddress;

    // Binance
    userBinanceClient.transfer = async (transferParams) => {
      console.log('userBinanceClient.transfer', transferParams);
      return new Promise((resolve, reject) => {
        (window as any).xfi.binance.request(
          {
            method: 'transfer',
            params: [
              {
                ...transferParams,
                from: bnbAddress,
                amount: {
                  amount: transferParams.amount.amount().toString(),
                  decimals: transferParams.amount.decimal,
                },
              },
            ],
          },
          (err, result) => {
            if (err) {
              return reject(err);
            }
            return resolve(result);
          }
        );
      });
    };

    // Bitcoin
    userBtcClient.transfer = async (transferParams) => {
      console.log('userBtcClient.transfer', transferParams);
      return new Promise((resolve, reject) => {
        (window as any).xfi.bitcoin.request(
          {
            method: 'transfer',
            params: [
              {
                ...transferParams,
                from: btcAddress,
                amount: {
                  amount: transferParams.amount.amount().toString(),
                  decimals: transferParams.amount.decimal,
                },
              },
            ],
          },
          (err, result) => {
            if (err) {
              return reject(err);
            }
            return resolve(result);
          }
        );
      });
    };

    // BCH
    userbchClient.transfer = async (transferParams) => {
      console.log('userbchClient.transfer', transferParams);
      return new Promise((resolve, reject) => {
        (window as any).xfi.bitcoincash.request(
          {
            method: 'transfer',
            params: [
              {
                ...transferParams,
                from: bchAddress,
                amount: {
                  amount: transferParams.amount.amount().toString(),
                  decimals: transferParams.amount.decimal,
                },
              },
            ],
          },
          (err, result) => {
            if (err) {
              return reject(err);
            }
            return resolve(result);
          }
        );
      });
    };

    // Eth
    userEthereumClient.approve = async ({
      // spender,
      // sender,
      spenderAddress,
      contractAddress,
      amount,
      feeOptionKey,
    }: ApproveParams) => {
      const gasPrice =
        feeOptionKey &&
        BigNumber.from(
          (
            await userEthereumClient
              .estimateGasPrices()
              .then((prices) => prices[feeOptionKey])
              .catch(() => {
                const { gasPrices } =
                  estimateDefaultFeesWithGasPricesAndLimits();
                return gasPrices[feeOptionKey];
              })
          )
            .amount()
            .toFixed()
        );
      const gasLimit = await userEthereumClient
        .estimateApprove({ spenderAddress, contractAddress, amount })
        .catch(() => undefined);

      const txAmount = amount
        ? BigNumber.from(amount.amount().toFixed())
        : BigNumber.from(2).pow(256).sub(1);
      const contract = new ethers.Contract(contractAddress, erc20ABI);
      const unsignedTx = await contract.populateTransaction.approve(
        spenderAddress,
        txAmount,
        {
          from: userEthereumClient.getAddress(),
          gasPrice,
          gasLimit,
        }
      );
      unsignedTx.from = ethAddresses[0];
      const provider = new ethers.providers.Web3Provider(window.ethereum)
      return provider
        .send(
          'eth_sendTransaction',
          [unsignedTx],
        )
        .then((tx: TransactionResponse)  => {
          return tx;
        });
    };
    const oldWallet = userEthereumClient.getWallet();
    oldWallet.getAddress = async () => ethAddresses[0];
    oldWallet.sendTransaction = (unsignedTx) => {
      unsignedTx.value = hexlify(BigNumber.from(unsignedTx.value || 0));
      const provider = new ethers.providers.Web3Provider(window.ethereum)
      return provider
        .send(
          'eth_sendTransaction',
          [unsignedTx],
        )
        .then((tx: TransactionResponse) => {
          return tx;
        });
    };
    oldWallet.signTransaction = (unsignedTx) => {
      unsignedTx.value = hexlify(BigNumber.from(unsignedTx.value || 0));

      const provider = new ethers.providers.Web3Provider(window.ethereum)
      return provider
      .send(
        'eth_sendTransaction',
        [unsignedTx],
      )
      .then((tx: TransactionResponse) => {
        return tx.hash;
      });
    };
    const newGetWallet = () => {
      return oldWallet;
    };
    userEthereumClient.getWallet = newGetWallet;
    userEthereumClient.transfer = async ({
      asset,
      memo,
      amount,
      recipient,
      feeOptionKey,
      gasPrice,
      gasLimit,
    }) => {
      console.log({
        method: 'ethCLient.transfer',
        asset,
        memo,
        amount,
        recipient,
        feeOptionKey,
        gasPrice,
        gasLimit,
      });
      try {
        const txAmount = BigNumber.from(amount.amount().toFixed());

        let assetAddress;
        if (asset && assetToString(asset) !== assetToString(AssetETH)) {
          assetAddress = getTokenAddress(asset);
        }

        const isETHAddress = assetAddress === ETHAddress;

        // feeOptionKey

        const defaultGasLimit: ethers.BigNumber = isETHAddress
          ? BigNumber.from(21000)
          : BigNumber.from(100000);

        let overrides: TxOverrides = {
          gasLimit: gasLimit || defaultGasLimit,
          gasPrice: gasPrice && BigNumber.from(gasPrice.amount().toFixed()),
        };

        // override `overrides` if `feeOptionKey` is provided
        if (feeOptionKey) {
          const _gasPrice = await userEthereumClient
            .estimateGasPrices()
            .then((prices) => prices[feeOptionKey])
            .catch(
              () =>
                estimateDefaultFeesWithGasPricesAndLimits().gasPrices[
                  feeOptionKey
                ]
            );
          const _gasLimit = await userEthereumClient
            .estimateGasLimit({ asset, recipient, amount, memo })
            .catch(() => defaultGasLimit);

          overrides = {
            gasLimit: _gasLimit,
            gasPrice: BigNumber.from(_gasPrice.amount().toFixed()),
          };
        }

        let txResult;
        const provider = new ethers.providers.Web3Provider(window.ethereum)
        if (assetAddress && !isETHAddress) {
          // Transfer ERC20
          const contract = new ethers.Contract(assetAddress, erc20ABI);
          const unsignedTx = await contract.populateTransaction.transfer(
            recipient,
            txAmount,
            Object.assign({}, overrides)
          );
          unsignedTx.from = ethAddresses[0];
          txResult = provider.send(
            'eth_sendTransaction',
            [unsignedTx],
          );
        } else {
          // Transfer ETH
          const transactionRequest = Object.assign(
            { to: recipient, value: txAmount },
            {
              ...overrides,
              data: memo ? toUtf8Bytes(memo) : undefined,
              from: userEthereumClient.getAddress(),
            }
          );

          txResult = provider.send(
            'eth_sendTransaction',
            [transactionRequest],
          );
        }
        console.log(txResult);
        return txResult.hash || txResult;
      } catch (error) {
        console.error(error);
        return Promise.reject(error);
      }
    };

    userEthereumClient.call = async ({
      walletIndex,
      contractAddress,
      abi,
      funcName,
      funcParams,
    }) => {
      try {
        let params = funcParams ?? [];
        if (!contractAddress) {
          return Promise.reject(new Error('address must be provided'));
        }
        const contract = new ethers.Contract(
          contractAddress,
          abi,
          userEthereumClient.getProvider()
        );
        const txResult = await contract[funcName](...params, {
          from: ethAddresses[0],
        });
        console.log({ txResult });
        return txResult;
      } catch (error) {
        console.error(error);
        console.error('stack');
        return Promise.reject(error);
      }
    };
    // Thor
    userThorchainClient.deposit = async (depositParams) => {
      console.log('userThorchainClient.deposit', depositParams);

      const params = [
        {
          ...depositParams,
          asset: AssetRuneNative,
          from: thorAddress,
          amount: {
            amount: depositParams.amount.amount().toNumber(),
            decimals: depositParams.amount.decimal,
          },
          recipient: '',
        },
      ];

      console.log('params', params);
      return new Promise((resolve, reject) => {
        (window as any).xfi.thorchain.request(
          {
            method: 'deposit',
            params,
          },
          (err, result) => {
            if (err) {
              return reject(err);
            }
            return resolve(result);
          }
        );
      });
    };

    userThorchainClient.transfer = async (transferParams) => {
      console.log('userThorchainClient.transfer', transferParams);
      return new Promise((resolve, reject) => {
        (window as any).xfi.thorchain.request(
          {
            method: 'transfer',
            params: [
              {
                ...transferParams,
                asset: AssetRuneNative,
                from: thorAddress,
                amount: {
                  amount: transferParams.amount.amount().toString(),
                  decimals: transferParams.amount.decimal,
                },
              },
            ],
          },
          (err, result) => {
            if (err) {
              return reject(err);
            }
            return resolve(result);
          }
        );
      });
    };
    // Ltc
    userLtcClient.transfer = async (transferParams) => {
      console.log('userLtcClient.transfer', transferParams);
      return new Promise((resolve, reject) => {
        (window as any).xfi.litecoin.request(
          {
            method: 'transfer',
            params: [
              {
                ...transferParams,
                from: ltcAddress,
                amount: {
                  amount: transferParams.amount.amount().toString(),
                  decimals: transferParams.amount.decimal,
                },
              },
            ],
          },
          (err, result) => {
            if (err) {
              return reject(err);
            }
            return resolve(result);
          }
        );
      });
    };

    console.log({
      thorAddress,
      bnbAddress,
      btcAddress,
      bchAddress,
      ethAddresses,
      ltcAddress,
    });

    const newUser = new User({
      type: 'XDEFI',
      wallet: thorAddress,
      clients: {
        binance: userBinanceClient,
        bitcoin: userBtcClient,
        bitcoinCash: userbchClient,
        thorchain: userThorchainClient,
        ethereum: userEthereumClient,
        litecoin: userLtcClient,
      },
    });

    return newUser;
  }
}
