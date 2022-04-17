import { Injectable } from '@angular/core';
import WalletConnect from '@walletconnect/client';
import QRCodeModal from '@walletconnect/qrcode-modal';
import { IConnector, IWalletConnectOptions } from '@walletconnect/types';
import { AssetETH, AssetRuneNative, assetToString, BaseAmount, baseAmount, Chain } from '@xchainjs/xchain-util';
import { MockClientService } from './mock-client.service';
import { SignedSend } from '@binance-chain/javascript-sdk/lib/types';
import * as base64js from 'base64-js';
import { User } from '../_classes/user';
import { UserService } from './user.service';
import { CosmosSDKClient } from '@xchainjs/xchain-cosmos';
import { cosmosclient, proto, rest } from '@cosmos-client/core';
import {
  DECIMAL,
  getDenom,
  isAssetRuneNative,
  msgNativeTxFromJson,
} from '@xchainjs/xchain-thorchain';
import { MidgardService } from './midgard.service';
import {
  ApproveParams,
  estimateDefaultFeesWithGasPricesAndLimits,
  ETHAddress,
  getTokenAddress,
  TxOverrides,
} from '@xchainjs/xchain-ethereum';
import { BigNumber } from '@ethersproject/bignumber';
import { ethers } from 'ethers';
import { erc20ABI } from '../_abi/erc20.abi';
import { hexlify, toUtf8Bytes } from 'ethers/lib/utils';
import WalletConnectProvider from '@walletconnect/web3-provider';
import { environment } from 'src/environments/environment';
import { decodeAddress } from '@binance-chain/javascript-sdk/lib/crypto';
import { Asset } from '../_classes/asset';
import {
  DEPOSIT_GAS_VALUE,
  DEFAULT_GAS_VALUE,
} from '@xchainjs/xchain-thorchain';
import Long from 'long';
import { HttpClient } from '@angular/common/http';

const qrcodeModalOptions = {
  mobileLinks: ['trust'],
};

const CoinType: { [key: string]: number } = {
  binance: 714,
  ethereum: 60,
  thorchain: 931,
};

const supoortedChains = [
  CoinType.binance,
  CoinType.ethereum,
  CoinType.thorchain,
];

const chainToNet = {
  BNB: CoinType.binance,
  ETH: CoinType.ethereum,
  THOR: CoinType.thorchain,
};

const supportedNetworkChains = {
  mainnet: 1,
  testnet: 3,
};

const errorCodes = {
  ERROR_SESSION_DISCONNECTED: 'Trust Wallet Session has ended.',
};

export interface TxParam {
  fromAddress: string;
  toAddress: string;
  denom: string;
  amount: number;
}

type SignRequestParam = {
  accountNumber: string;
  sequence: string;
  memo: string;
  txParam: TxParam;
};

export const THORCHAIN_NETWORK = CoinType.thorchain;

export const BINANCE_CHAIN_ID = 'Binance-Chain-Tigris';
export const THORCHAIN_ID = 'thorchain-mainnet-v1'; // should be taken from block_info RPC
const THORCHAIN_DEPOSIT_GAS_FEE = DEPOSIT_GAS_VALUE;
const THORCHAIN_SEND_GAS_FEE = DEFAULT_GAS_VALUE;

export type Coin = {
  denom: string;
  amount: string;
};

export type Fee = {
  amounts: Coin[];
  gas: string;
};

export type SendCoinsMessage = {
  fromAddress: string;
  toAddress: string;
  amounts: Coin[];
};

export type SendMessage = {
  sendCoinsMessage: SendCoinsMessage;
};

export type THORChainSendTx = {
  accountNumber: string;
  chainId: string;
  fee: Fee;
  memo: string;
  sequence: string;
  messages: SendMessage[];
};

export type RawJSONMessage = {
  rawJsonMessage: {
    type: string;
    value: string;
  };
};

export type THORChainDepositTx = {
  accountNumber: string;
  chainId: string;
  fee: Fee;
  memo: string;
  sequence: string;
  messages: RawJSONMessage[];
};

@Injectable({
  providedIn: 'root',
})
export class WalletConnectService {
  constructor(
    private mockClientService: MockClientService,
    private userService: UserService,
    private midgardService: MidgardService,
    private http: HttpClient
  ) {}

  connector: IConnector | null;
  private options: IWalletConnectOptions;
  accounts: { network: number; address: string }[] = [];

  get connected() {
    if (this.connector) {
      return this.connector.connected;
    }
    return false;
  }

  killSession = async (): Promise<void> => {
    if (this.connector) {
      await this.connector.killSession();
    }

    this.connector = null;
  };

  async connect(closeCallback?) {
    const options: IWalletConnectOptions = {
      bridge: 'https://polygon.bridge.walletconnect.org',
      qrcodeModal: QRCodeModal,
      ...this.options,
    };

    const connector = new WalletConnect(options);
    // Check if connection is already established
    if (!connector.connected) {
      // create new session
      await connector.createSession();

      // display QR Code modal OR MobileLink for trustwallet
      QRCodeModal.open(
        connector.uri,
        () => {
          console.log('QR is closed');
          closeCallback();
        },
        qrcodeModalOptions
      );
    } else {
      connector.updateSession({
        chainId: connector.chainId,
        accounts: connector.accounts,
      });
    }

    this.connector = connector;

    return new Promise((resolve, reject) => {
      connector.on('connect', (error, payload) => {
        if (error) {
          console.log('walletConnector connect error: ', error);
          reject(error);
        }

        QRCodeModal.close();

        const {
          accounts,
          peerMeta: { name: name },
        } = connector;

        // get accounts
        this.getAccounts({ accounts, name }).then((res) => {
          if (!res) return;
          this.makeUser()
            .then((user) => {
              this.userService.setUser(user);
              resolve(true);
            })
            .catch((error) => {
              reject(error);
            });
        });
      });

      connector.on('disconnect', (error) => {
        console.log('diconnected');
        if (error) reject(error);

        this.connector = null;
        this.userService.setUser(null);
      });

      if (connector.connected) {
        const {
          accounts,
          peerMeta: { name: name },
        } = connector;

        // get accounts
        this.getAccounts({ accounts, name }).then((res) => {
          if (!res) return;
          this.makeUser()
            .then((user) => {
              this.userService.setUser(user);
              resolve(true);
            })
            .catch((error) => {
              reject(error);
            });
        });
      }
    });
  }

  supportWC(name) {
    return name.toUpperCase().includes('TRUST WALLET');
  }

  getAccounts = async ({ accounts, name }): Promise<any> => {
    if (!this.connector) {
      throw new Error(errorCodes.ERROR_SESSION_DISCONNECTED);
    }

    // see if all walletconnects support get_accounts extension (TRUST WALLET)
    if (accounts && !this.supportWC(name)) {
      const isEth = this.mockClientService
        .getMockClientByChain(Chain.Ethereum)
        .validateAddress(accounts[0]);
      if (!isEth) {
        this.killSession();
        console.error(
          `This wallet is not supported yet. If you want us to support ${
            name ?? 'this wallet'
          }. Let us know!`
        );
        return;
      }
      // assuming it only works with eth when there is only one chain. which is waletconnect main support.
      this.accounts = [{ network: 60, address: accounts[0] }];
      return this.accounts;
    } else {
      try {
        const accountsReq = this.connector.sendCustomRequest({
          jsonrpc: '2.0',
          method: 'get_accounts',
        })

        const accounts = await Promise.race([
          accountsReq,
          new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error('timeout'));
            }, 2000)
          })
        ]).catch(err => {
          console.log(err);
          this.killSession();
        });

        const supportedAccounts = accounts.filter((account) =>
          supoortedChains.includes(account.network)
        );

        this.accounts = supportedAccounts;
        return this.accounts;
      } catch (error) {
        console.error(error);
      }
    }
  };

  checkEnvironmet() {
    if (
      supportedNetworkChains[environment.network] !== this.connector.chainId ||
      (this.getAddressbyChain(Chain.Binance) &&
        !this.mockClientService
          .getMockClientByChain(Chain.Binance)
          .validateAddress(this.getAddressbyChain(Chain.Binance))) ||
      (this.getAddressbyChain(Chain.THORChain) &&
        !this.mockClientService
          .getMockClientByChain(Chain.THORChain)
          .validateAddress(this.getAddressbyChain(Chain.THORChain)))
    ) {
      throw new Error('Environmet is not right');
    }
  }

  async makeUser(): Promise<User> {
    this.checkEnvironmet();

    // binance client
    const userBinanceClient = this.getAddressbyChain(Chain.Binance)
      ? await this.trustWalletBinanceClient()
      : undefined;
    // thochain client
    const userThorchainClient = this.getAddressbyChain(Chain.THORChain)
      ? await this.trustWalletThorchainClient()
      : undefined;
    // eth Client
    const userEthereumClient = this.getAddressbyChain(Chain.Ethereum)
      ? await this.trustWalletEthereumClient()
      : undefined;

    // adding clients if they are supported by walletconnect
    const clients = {
      ...(this.getAddressbyChain(Chain.Binance) && {
        binance: userBinanceClient,
      }),
      ...(this.getAddressbyChain(Chain.THORChain) && {
        thorchain: userThorchainClient,
      }),
      ...(this.getAddressbyChain(Chain.Ethereum) && {
        ethereum: userEthereumClient,
      }),
    };

    const walletConnectUser = new User({
      type: 'walletconnect',
      wallet:
        userThorchainClient?.getAddress() ||
        userBinanceClient?.getAddress() ||
        userEthereumClient?.getAddress(),
      clients,
    });

    return walletConnectUser;
  }

  getAddressbyChain(chain: Chain): string {
    return this.accounts.find((ac) => ac.network === chainToNet[chain])
      ?.address;
  }

  //Ethereum
  trustWalletEthereumClient() {
    const userEthereumClient = this.mockClientService.mockEthereumClient;
    const address = this.getAddressbyChain(Chain.Ethereum);
    userEthereumClient.getAddress = () => address;

    userEthereumClient.approve = async ({
      spenderAddress,
      contractAddress,
      amount,
      feeOptionKey,
    }: ApproveParams) => {
      console.log('should be here');
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
      unsignedTx.from = address;
      return this.transferERC20(unsignedTx).then((result) => {
        console.log(result);
        return result;
      });
    };

    const oldWallet = userEthereumClient.getWallet();
    oldWallet.getAddress = async () => address;
    oldWallet.sendTransaction = (unsignedTx) => {
      console.log('send transaction');
      unsignedTx.value = hexlify(BigNumber.from(unsignedTx.value || 0));
      const txParam = unsignedTx;

      return this.transferERC20(txParam).then((resp) => resp);
    };

    oldWallet.signTransaction = (unsignedTx) => {
      const txParam = unsignedTx;

      return this.signTransactionERC20(txParam).then(({ result }) => result);
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
      try {
        console.log('sending eth');
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
        if (assetAddress && !isETHAddress) {
          // Transfer ERC20
          const contract = new ethers.Contract(assetAddress, erc20ABI);
          const unsignedTx = await contract.populateTransaction.transfer(
            recipient,
            txAmount.toHexString(),
            { ...overrides }
          );
          unsignedTx.from = address;
          txResult = await this.transferERC20(unsignedTx);
        } else {
          // Transfer ETH
          const transactionRequest = {
            from: address,
            to: recipient,
            value: txAmount.toHexString(),
            ...overrides,
            data: memo ? toUtf8Bytes(memo) : undefined,
          };
          txResult = await this.transferERC20(transactionRequest);
        }

        return txResult.hash || txResult;
      } catch (error) {
        return Promise.reject(error);
      }
    };

    userEthereumClient.call = async ({
      contractAddress,
      abi,
      funcName,
      funcParams,
    }) => {
      try {
        console.log('eth call', funcName);
        let params = funcParams ?? [];
        if (!contractAddress) {
          return await Promise.reject(new Error('address must be provided'));
        }
        const walletconnectProvider = new WalletConnectProvider({
          infuraId: environment.infuraProjectId,
        });
        await walletconnectProvider.enable();
        const provider = new ethers.providers.Web3Provider(
          walletconnectProvider
        );
        const signer = provider.getSigner();

        const contract = new ethers.Contract(
          contractAddress,
          abi,
          provider
        ).connect(signer);
        return contract[funcName](...params);
      } catch (error) {
        return Promise.reject(error);
      }
    };

    return userEthereumClient;
  }

  //thorchain
  trustWalletThorchainClient() {
    const userThorchainClient = this.mockClientService.mockThorchainClient;
    const address = this.getAddressbyChain(Chain.THORChain);
    userThorchainClient.getAddress = () => address;

    userThorchainClient.transfer = async (txParams) => {
      const {
        asset = new Asset('THOR.RUNE'),
        amount,
        recipient,
        memo = '',
      } = txParams;

      if (!asset) throw Error('invalid asset');

      const account: any = await this.getAccount(
        address,
        userThorchainClient.getCosmosClient()
      );
      if (!account) throw Error('invalid account');

      const { account_number, sequence } = account;

      const sendCoinsMessage: SendCoinsMessage = {
        fromAddress: address,
        toAddress: recipient,
        amounts: [
          {
            denom: asset?.symbol.toLowerCase(),
            amount: amount.amount().toString(),
          },
        ],
      };

      const message = {
        sendCoinsMessage,
      };

      const fee: Fee = {
        amounts: [],
        gas: THORCHAIN_SEND_GAS_FEE,
      };

      // get tx signing msg
      const signRequestMsg: THORChainSendTx = {
        accountNumber: account_number.toString(),
        chainId: THORCHAIN_ID,
        fee,
        memo,
        sequence: sequence.toString(),
        messages: [message],
      };

      // request tx signing to walletconnect
      const signedTx = await this.signCustomTransaction({
        network: THORCHAIN_NETWORK,
        tx: signRequestMsg,
      });

      // broadcast raw tx
      const cosmosSDKClient: CosmosSDKClient = userThorchainClient.getCosmosClient();

      const signedTxObj = JSON.parse(signedTx);
      
      /*
      //Add these to tx build
      const authInfo = new proto.cosmos.tx.v1beta1.AuthInfo({
        signer_infos: [
          {
            public_key: cosmosclient.codec.packAnyFromCosmosJSON(signedTxObj.tx.signatures[0].pub_key),
            mode_info: {
              single: {
                mode: proto.cosmos.tx.signing.v1beta1.SignMode.SIGN_MODE_DIRECT,
              },
            },
            sequence: sequence,
          },
        ],
        fee: {
          amount: null,
          gas_limit: cosmosclient.Long.fromString(DEFAULT_GAS_VALUE)
        },
      });

      const txBody = new proto.cosmos.tx.v1beta1.TxBody({
        messages: [cosmosclient.codec.packAnyFromCosmosJSON([message])],
        memo,
      });

      const txBuilder = new cosmosclient.TxBuilder(cosmosSDKClient.sdk, txBody, authInfo);

      //sign
      const signDocBytes = txBuilder.signDocBytes(account_number)

      await this.http.post(`${this.server}/cosmos/tx/v1beta1/txs`, {
       tx_bytes: txBuilder.txBytes(),
       mode: rest.cosmos.tx.BroadcastTxMode.Block,
      })
      */
      
      if (!signedTxObj?.tx) throw Error('tx signing failed');

      //patch sequence
      signedTxObj.tx.signatures[0].sequence = "1";

      const thornodeBasePath =
        environment.network === 'testnet'
        ? 'https://testnet.thornode.thorchain.info'
        : 'https://thornode.ninerealms.com';

      const data = await this.http
      .post<any>(
        `${thornodeBasePath}/txs`,
        signedTxObj
      )
      .toPromise();

      if (!data.logs) throw Error('Transaction Failed');

      // return tx hash
      return data?.txhash || '';
    };

    userThorchainClient.deposit = async (txParams) => {
      const { amount, memo } = txParams;

      const signer = userThorchainClient.getAddress();
      const msgNativeTx = msgNativeTxFromJson({
        coins: [
          {
            asset: AssetRuneNative,
            amount: amount.amount().toString(),
          },
        ],
        memo,
        signer,
      });

      const unsignedStdTx = await this.midgardService.buildDepositTx(msgNativeTx);

      unsignedStdTx.fee.gas = THORCHAIN_DEPOSIT_GAS_FEE;

      const account: any = await this.getAccount(
        address,
        userThorchainClient.getCosmosClient()
      );
      if (!account) throw Error('invalid account');

      const { account_number, sequence } = account;

      const fee: Fee = {
        amounts: [],
        gas: THORCHAIN_DEPOSIT_GAS_FEE,
      };

      const unsignedMsg = unsignedStdTx.msg[0] as any;
      const txMsgType = unsignedMsg.type;
      const txMsgValue = unsignedMsg.value;

      // get tx signing msg
      const signRequestMsg: THORChainDepositTx = {
        accountNumber: account_number.toString(),
        chainId: THORCHAIN_ID,
        fee,
        memo: '',
        sequence: sequence.toString(),
        messages: [
          {
            rawJsonMessage: {
              type: txMsgType,
              value: JSON.stringify(txMsgValue),
            },
          },
        ],
      };

      const { average: THORfee } = await userThorchainClient.getFees()
      const balances = await userThorchainClient.getBalance(userThorchainClient.getAddress())
      const runeBalance: BaseAmount =
        balances.filter(({ asset }) => isAssetRuneNative(asset))[0]?.amount ?? baseAmount(0, DECIMAL)

      if (isAssetRuneNative(AssetRuneNative)) {
        // amount + fee < runeBalance
        if (runeBalance.lt(amount.plus(THORfee))) {
          throw new Error('Insufficient funds')
        }
      }

      // request tx signing to walletconnect
      const signedTx = await this.signCustomTransaction({
        network: THORCHAIN_NETWORK,
        tx: signRequestMsg,
      });

      const signedTxObj = JSON.parse(signedTx);
      
      if (!signedTxObj?.tx) throw Error('tx signing failed');

      //patch sequence
      signedTxObj.tx.signatures[0].sequence = sequence.toString();

      console.log(signedTxObj)
      
      const thornodeBasePath =
        environment.network === 'testnet'
        ? 'https://testnet.thornode.thorchain.info'
        : 'https://thornode.ninerealms.com';

      const data = await this.http
      .post<any>(
        `${thornodeBasePath}/txs`,
        signedTxObj
      )
      .toPromise();

      if (!data.logs) throw Error('Transaction Failed');

      // return tx hash
      return data?.txhash || '';
    };

    return userThorchainClient;
  }

  getAccount = async (
    address: string,
    cosmosSDKClient: CosmosSDKClient
  ): Promise<proto.cosmos.auth.v1beta1.BaseAccount> => {

    /* Old Version
    / const signer = AccAddress.fromBech32(address);
    / const { data } = await auth.accountsAddressGet(cosmosSDKClient.sdk, signer); 
    */
   
    const signer = cosmosclient.AccAddress.fromString(address);
    const { data } = await rest.auth.account(cosmosSDKClient.sdk, signer).catch((_) => undefined);
    const baseAcc = data.account && cosmosclient.codec.unpackCosmosAny(data.account);

    if ((baseAcc instanceof proto.cosmos.auth.v1beta1.BaseAccount)) {
      return baseAcc;
    }

    return undefined;
  };

  //binance
  trustWalletBinanceClient() {
    const userBinanceClient = this.mockClientService.mockBinanceClient;
    const address = this.getAddressbyChain(Chain.Binance);
    userBinanceClient.getAddress = () => address;
    const bncClient = userBinanceClient.getBncClient();

    userBinanceClient.transfer = async (txParams) => {
      const { asset, amount, recipient, memo = '' } = txParams;

      if (!asset) throw Error('invalid asset');

      const account = await bncClient.getAccount(address);
      if (!account) throw Error('invalid account');

      const accountNumber = account.result.account_number.toString();
      const sequence = account.result.sequence.toString();
      const txParam = {
        fromAddress: address,
        toAddress: recipient,
        denom: asset?.symbol,
        amount: amount.amount().toNumber(),
      };

      // get tx signing msg
      const signRequestMsg = this.getSignRequestMsg({
        accountNumber,
        sequence,
        memo,
        txParam,
      });

      // request tx signing to walletconnect
      const signedTx = await this.signCustomTransaction({
        network: CoinType.binance,
        tx: signRequestMsg,
      });

      // broadcast raw tx
      const res = await bncClient.sendRawTransaction(signedTx, true);

      // return tx hash
      return res?.result[0]?.hash;
    };

    return userBinanceClient;
  }

  signCustomTransaction = async ({
    network,
    tx,
  }: {
    network: number;
    tx: any;
  }): Promise<any> => {
    if (!this.connector) {
      throw new Error(errorCodes.ERROR_SESSION_DISCONNECTED);
    }

    return this.connector.sendCustomRequest({
      jsonrpc: '2.0',
      method: 'trust_signTransaction',
      params: [
        {
          network,
          transaction: JSON.stringify(tx),
        },
      ],
    });
  };

  getByteArrayFromAddress = (address: string) => {
    return base64js.fromByteArray(decodeAddress(address));
  };

  buildTransferMsg = (txParam: TxParam): SignedSend => {
    const { fromAddress, toAddress, denom, amount } = txParam;

    const transferMsg = {
      inputs: [
        {
          address: this.getByteArrayFromAddress(fromAddress),
          coins: [
            {
              denom,
              amount,
            },
          ],
        },
      ],
      outputs: [
        {
          address: this.getByteArrayFromAddress(toAddress),
          coins: [
            {
              denom,
              amount,
            },
          ],
        },
      ],
    };

    return transferMsg;
  };

  getSignRequestMsg = ({
    accountNumber,
    sequence,
    memo,
    txParam,
  }: SignRequestParam) => {
    const transferMsg = this.buildTransferMsg(txParam);

    const tx = {
      accountNumber,
      chainId: BINANCE_CHAIN_ID,
      sequence,
      memo,
      send_order: transferMsg,
    };

    return tx;
  };

  //ERC20
  transferERC20 = (txParams: any) => {
    if (txParams.gasPrice)
      txParams.gasPrice = txParams.gasPrice._hex
        ? txParams.gasPrice._hex
        : txParams.gasPrice;
    if (txParams.gasLimit)
      txParams.gasLimit = txParams.gasLimit._hex
        ? txParams.gasLimit._hex
        : txParams.gasLimit;
    console.log('Walletconnect erc20 transfer params:', txParams);
    if (!this.connector) {
      throw new Error(errorCodes.ERROR_SESSION_DISCONNECTED);
    }

    return this.connector.sendTransaction(txParams);
  };

  signTransactionERC20 = (txParams: any) => {
    if (!this.connector) {
      throw new Error(errorCodes.ERROR_SESSION_DISCONNECTED);
    }

    return this.connector.signTransaction(txParams);
  };
}
