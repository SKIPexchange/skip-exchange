import {
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { ETH_DECIMAL } from '@xchainjs/xchain-ethereum/lib';
import {
  baseAmount,
  assetToBase,
  assetAmount,
  Asset,
  assetToString,
  Chain,
} from '@xchainjs/xchain-util';
import { Subscription } from 'rxjs';
import { erc20ABI } from 'src/app/_abi/erc20.abi';
import { AssetAndBalance } from 'src/app/_classes/asset-and-balance';
import { User } from 'src/app/_classes/user';
import { TransactionConfirmationState } from 'src/app/_const/transaction-confirmation-state';
import {
  TransactionStatusService,
  TxActions,
  TxStatus,
} from 'src/app/_services/transaction-status.service';
import { UserService } from 'src/app/_services/user.service';
import {
  MainViewsEnum,
  OverlaysService,
} from 'src/app/_services/overlays.service';
import { BigNumber, ethers } from 'ethers';
import { Asset as AsgrsxAsset } from 'src/app/_classes/asset';
import { Balance } from '@xchainjs/xchain-client';
import { MidgardService } from 'src/app/_services/midgard.service';
import { PoolAddressDTO } from 'src/app/_classes/pool-address';
import { TransactionUtilsService } from 'src/app/_services/transaction-utils.service';
import { EthUtilsService } from 'src/app/_services/eth-utils.service';
import {
  AnalyticsService,
  assetString,
} from 'src/app/_services/analytics.service';
import { noticeData } from 'src/app/_components/success-notice/success-notice.component';
import { MockClientService } from 'src/app/_services/mock-client.service';
import { SuccessModal } from 'src/app/_components/transaction-success-modal/transaction-success-modal.component';
import { TranslateService } from 'src/app/_services/translate.service';
import { environment } from 'src/environments/environment';
import { getTerraNativeDenom, TERRA_DECIMAL } from '@xchainjs/xchain-terra';

@Component({
  selector: 'app-confim-send',
  templateUrl: './confim-send.component.html',
  styleUrls: ['./confim-send.component.scss'],
})
export class ConfimSendComponent implements OnInit, OnDestroy {
  @Input() set asset(asset: AssetAndBalance) {
    this._asset = asset;
  }
  get asset() {
    return this._asset;
  }
  _asset: AssetAndBalance;
  @Input() amount: number;
  @Input() recipientAddress: string;
  @Input() memo: string;
  @Output() back: EventEmitter<null>;
  @Output() close: EventEmitter<null>;
  @Output() transactionSuccessful: EventEmitter<null>;
  @Output() messageChange: EventEmitter<string> = new EventEmitter<string>();

  private _mode:
    | 'ADDRESSES'
    | 'ADDRESS'
    | 'PENDING_TXS'
    | 'ASSET'
    | 'SEND'
    | 'CONFIRM_SEND'
    | 'PROCESSING'
    | 'SUCCESS'
    | 'ERROR';
  @Input() get mode() {
    return this._mode;
  }
  set mode(val) {
    this._mode = val;
    if (this._mode == 'CONFIRM_SEND') this.messageChange.emit('Confirm');
    else if (this._mode == 'ERROR') this.messageChange.emit(this.message);
    else if (this._mode == 'PROCESSING') this.messageChange.emit('PROCESSING');
    else if (this._mode == 'SUCCESS') this.messageChange.emit('Success');
  }
  @Output() modeChange = new EventEmitter();

  user: User;
  subs: Subscription[];
  txState: TransactionConfirmationState;
  hash: string;
  address: string;
  message: string;
  error: string;
  insufficientChainBalance: boolean;
  balances: Balance[];
  hashes: noticeData[];

  constructor(
    private userService: UserService,
    private txStatusService: TransactionStatusService,
    private overlaysService: OverlaysService,
    private ethUtilsService: EthUtilsService,
    private mockClientService: MockClientService,
    private midgardService: MidgardService,
    private txUtilsService: TransactionUtilsService,
    private analytics: AnalyticsService,
    public translate: TranslateService
  ) {
    this.back = new EventEmitter<null>();
    this.close = new EventEmitter<null>();
    this.message = this.translate.format('breadcrumb.confirm');
    this.transactionSuccessful = new EventEmitter<null>();
    this.txState = TransactionConfirmationState.PENDING_CONFIRMATION;
    this.hash = this.translate.format('pending.noTX');

    const user$ = this.userService.user$.subscribe(
      (user) => (this.user = user)
    );

    this.subs = [user$];
  }

  ngOnInit(): void {
    const balances$ = this.userService.userBalances$.subscribe((balances) => {
      this.balances = balances;
    });
    this.subs.push(balances$);
  }

  getSuccessData(): SuccessModal {
    // prettier-ignore
    return {
      modalType: 'SEND',
      asset: [this.asset], 
      label: ['Sent'],
      amount: [this.amount], 
      balances: this.balances,
      hashes: this.hashes,
      isPlus: true,
    };
  }

  submitTransaction() {
    this.mode = 'PROCESSING';
    this.modeChange.emit(this.mode);

    this.txState = TransactionConfirmationState.SUBMITTING;

    let sendAmountUSD = this.amount * this.asset.assetPriceUSD;
    this.analytics.event(
      'wallet_asset_send_confirm',
      'button_confirm_*WALLET*_*ASSET*_usd_*numerical_usd_value*',
      sendAmountUSD,
      this.asset.asset.chain,
      assetString(this.asset.asset),
      sendAmountUSD.toString()
    );

    if (
      this.user.type === 'keystore' ||
      this.user.type === 'XDEFI' ||
      this.user.type === 'walletconnect'
    ) {
      this.midgardService
        .getInboundAddresses()
        .subscribe((addresses) => this.submitKeystoreTransaction(addresses));
    }
  }

  async breadcrumbNav(
    nav: string,
    type: 'processing' | 'success' | 'pending' = 'pending'
  ) {
    let label;
    switch (type) {
      case 'success':
        label = 'wallet_asset_send_success';
        break;
      case 'processing':
        label = 'wallet_asset_send_processing';
        break;
      default:
        label = 'wallet_asset_send_confirm';
        break;
    }

    this.address = await this.userService.getAdrressChain(
      this.asset.asset.chain
    );

    if (nav === 'swap') {
      this.analytics.event(label, 'breadcrumb_skip');
      this.overlaysService.setViews(MainViewsEnum.Swap, 'Swap');
    } else if (nav === 'wallet') {
      this.analytics.event(label, 'breadcrumb_wallet');
      this.overlaysService.setCurrentUserView({
        userView: 'Addresses',
        address: null,
        chain: null,
        asset: null,
      });
    } else if (nav === 'chain') {
      this.analytics.event(
        label,
        'breadcrumb_*WALLET*',
        undefined,
        this.asset.asset.chain
      );
      this.overlaysService.setCurrentUserView({
        userView: 'Address',
        address: this.address,
        chain: this.asset.asset.chain,
        asset: null,
      });
    } else if (nav === 'asset') {
      this.analytics.event(
        label,
        'breadcrumb_*ASSET*',
        undefined,
        assetString(this.asset.asset)
      );
      this.overlaysService.setCurrentUserView({
        userView: 'Asset',
        address: this.address,
        chain: this.asset.asset.chain,
        asset: this.asset,
      });
    }
  }

  async submitKeystoreTransaction(inboundAddresses: PoolAddressDTO[]) {
    if (this.asset && this.asset.asset) {
      // find recipient pool
      const matchingAddress = inboundAddresses.find(
        (pool) => pool.chain === this.asset.asset.chain
      );
      if (
        !matchingAddress && 
        this.asset.asset.chain !== 'THOR' &&
        !(
          environment.network === 'testnet' &&
          (
            this.asset.asset.chain === Chain.Terra ||
            this.asset.asset.chain === Chain.Doge
          ) 
        )
      ) {
        console.error('no recipient pool found');
        this.message = 'no recipient pool found';
        this.txState = TransactionConfirmationState.ERROR;
        this.mode = 'ERROR';
        this.modeChange.emit(this.mode);
        return;
      }

      if (this.asset.asset.chain === 'THOR') {
        const client = this.user.clients.thorchain;
        if (!client) {
          console.error('no thorchain client found');
          return;
        }

        try {
          const fees = await client.getFees();
          const amount = assetToBase(assetAmount(this.amount))
            .amount()
            .toNumber();
          const hash = await client.transfer({
            amount: baseAmount(amount - fees.average.amount().toNumber()),
            recipient: this.recipientAddress,
          });
          this.hash = hash;
          this.pushTxStatus(hash, this.asset.asset, true);
          this.makeHashes(this.asset.asset);
          this.transactionSuccessful.next();
          this.mode = 'SUCCESS';
          this.txState = TransactionConfirmationState.SUCCESS;
        } catch (error) {
          console.error('error making transfer: ', error);
          this.message = error.message || error;
          this.txState = TransactionConfirmationState.ERROR;
          this.mode = 'ERROR';
          this.modeChange.emit(this.mode);
        }
      } else if (this.asset.asset.chain === 'BNB') {
        const binanceClient = this.user.clients.binance;

        try {
          const hash = await binanceClient.transfer({
            asset: this.asset.asset,
            amount: assetToBase(assetAmount(this.amount)),
            recipient: this.recipientAddress,
            memo: this.memo ?? '',
          });
          this.hash = hash;
          this.pushTxStatus(hash, this.asset.asset, false);
          this.makeHashes(this.asset.asset);
          this.transactionSuccessful.next();
          this.mode = 'SUCCESS';
          this.txState = TransactionConfirmationState.SUCCESS;
        } catch (error) {
          console.error('error making transfer: ', error);
          this.message = error.message || error;
          this.txState = TransactionConfirmationState.ERROR;
          this.mode = 'ERROR';
          this.modeChange.emit(this.mode);
        }
      } else if (this.asset.asset.chain === 'BTC') {
        const bitcoinClient = this.user.clients.bitcoin;

        try {
          // TODO -> consolidate this with BTC, BCH, LTC
          const asset = new AsgrsxAsset(`BTC.BTC`);
          const estimatedFee = this.txUtilsService.calculateNetworkFee(
            asset,
            inboundAddresses,
            'INBOUND'
          );
          const balanceAmount = this.userService.findRawBalance(
            this.balances,
            asset
          );
          const toBase = assetToBase(assetAmount(this.amount));
          const feeToBase = assetToBase(assetAmount(estimatedFee));
          const amount = balanceAmount
            // subtract fee
            .minus(feeToBase.amount())
            // subtract amount
            .minus(toBase.amount())
            .isGreaterThan(0)
            ? toBase.amount() // send full amount, fee can be deducted from remaining balance
            : toBase.amount().minus(feeToBase.amount()); // after deductions, not enough to process, subtract fee from amount

          if (amount.isLessThan(0)) {
            this.message = 'Insufficient funds. Try sending a smaller amount';
            this.txState = TransactionConfirmationState.ERROR;
            return;
          }
          // TODO -> consolidate this with BTC, BCH, LTC

          const hash = await bitcoinClient.transfer({
            amount: baseAmount(amount),
            recipient: this.recipientAddress,
            feeRate: +matchingAddress.gas_rate,
          });
          this.hash = hash;
          this.pushTxStatus(hash, this.asset.asset, false);
          this.makeHashes(this.asset.asset);
          this.transactionSuccessful.next();
          this.mode = 'SUCCESS';
          this.txState = TransactionConfirmationState.SUCCESS;
        } catch (error) {
          console.error('error making transfer: ', error);
          this.message = error.message || error;
          this.txState = TransactionConfirmationState.ERROR;
          this.mode = 'ERROR';
          this.modeChange.emit(this.mode);
        }
      } else if (this.asset.asset.chain === 'BCH') {
        const bchClient = this.user.clients.bitcoinCash;

        try {
          // TODO -> consolidate this with BTC, BCH, LTC
          const asset = new AsgrsxAsset(`BCH.BCH`);
          const estimatedFee = this.txUtilsService.calculateNetworkFee(
            asset,
            inboundAddresses,
            'INBOUND'
          );
          const balanceAmount = this.userService.findRawBalance(
            this.balances,
            asset
          );
          const toBase = assetToBase(assetAmount(this.amount));
          const feeToBase = assetToBase(assetAmount(estimatedFee));
          const amount = balanceAmount
            // subtract fee
            .minus(feeToBase.amount())
            // subtract amount
            .minus(toBase.amount())
            .isGreaterThan(0)
            ? toBase.amount() // send full amount, fee can be deducted from remaining balance
            : toBase.amount().minus(feeToBase.amount()); // after deductions, not enough to process, subtract fee from amount

          if (amount.isLessThan(0)) {
            this.message = 'Insufficient funds. Try sending a smaller amount';
            this.txState = TransactionConfirmationState.ERROR;
            return;
          }
          // TODO -> consolidate this with BTC, BCH, LTC

          const hash = await bchClient.transfer({
            amount: baseAmount(amount),
            recipient: this.recipientAddress,
            feeRate: +matchingAddress.gas_rate,
          });
          this.hash = hash;
          this.pushTxStatus(hash, this.asset.asset, false);
          this.makeHashes(this.asset.asset);
          this.transactionSuccessful.next();
          this.mode = 'SUCCESS';
          this.txState = TransactionConfirmationState.SUCCESS;
        } catch (error) {
          console.error('error making transfer: ', error);
          this.message = error.message || error;
          this.txState = TransactionConfirmationState.ERROR;
          this.mode = 'ERROR';
          this.modeChange.emit(this.mode);
        }
      } else if (this.asset.asset.chain === 'ETH') {
        const ethClient = this.user.clients.ethereum;
        const asset = this.asset.asset;
        let decimal;
        const wallet = ethClient.getWallet();

        if (asset.symbol === 'ETH') {
          decimal = ETH_DECIMAL;
        } else {
          const assetAddress = asset.symbol.slice(asset.ticker.length + 1);
          const strip0x = assetAddress.substr(2);
          const checkSummedAddress = ethers.utils.getAddress(strip0x);
          const tokenContract = new ethers.Contract(
            checkSummedAddress,
            erc20ABI,
            wallet
          );
          const decimals = await tokenContract.decimals();
          decimal = decimals;
        }

        const gasPrice = baseAmount(
          ethers.utils.parseUnits(matchingAddress.gas_rate, 'gwei').toString(),
          ETH_DECIMAL
        );

        try {
          const hash = await ethClient.transfer({
            asset: {
              chain: asset.chain,
              symbol: asset.symbol,
              ticker: asset.ticker,
              synth: false
            },
            amount: assetToBase(assetAmount(this.amount, decimal)),
            recipient: this.recipientAddress,
            gasLimit:
              assetToString(this.asset.asset) === 'ETH.ETH'
                ? BigNumber.from(21000) // ETH
                : BigNumber.from(100000), // ERC20
            gasPrice,
          });
          this.hash = hash;
          this.pushTxStatus(hash, this.asset.asset, false);
          this.makeHashes(this.asset.asset);
          this.transactionSuccessful.next();
          this.mode = 'SUCCESS';
          this.txState = TransactionConfirmationState.SUCCESS;
        } catch (error) {
          console.error('error making transfer: ', error);
          this.message = error.message || error;
          this.txState = TransactionConfirmationState.ERROR;
          this.mode = 'ERROR';
          this.modeChange.emit(this.mode);
        }
      } else if (this.asset.asset.chain === 'LTC') {
        const litecoinClient = this.user.clients.litecoin;

        try {
          // TODO -> consolidate this with BTC, BCH, LTC
          const asset = new AsgrsxAsset(`LTC.LTC`);
          const estimatedFee = this.txUtilsService.calculateNetworkFee(
            asset,
            inboundAddresses,
            'INBOUND'
          );
          const balanceAmount = this.userService.findRawBalance(
            this.balances,
            asset
          );
          const toBase = assetToBase(assetAmount(this.amount));
          const feeToBase = assetToBase(assetAmount(estimatedFee));
          const amount = balanceAmount
            // subtract fee
            .minus(feeToBase.amount())
            // subtract amount
            .minus(toBase.amount())
            .isGreaterThan(0)
            ? toBase.amount() // send full amount, fee can be deducted from remaining balance
            : toBase.amount().minus(feeToBase.amount()); // after deductions, not enough to process, subtract fee from amount

          if (amount.isLessThan(0)) {
            this.message = 'Insufficient funds. Try sending a smaller amount';
            this.txState = TransactionConfirmationState.ERROR;
            return;
          }
          // TODO -> consolidate this with BTC, BCH, LTC

          const hash = await litecoinClient.transfer({
            amount: baseAmount(amount),
            recipient: this.recipientAddress,
            feeRate: +matchingAddress.gas_rate,
          });
          this.hash = hash;
          this.pushTxStatus(hash, this.asset.asset, false);
          this.makeHashes(this.asset.asset);
          this.transactionSuccessful.next();
          this.mode = 'SUCCESS';
          this.txState = TransactionConfirmationState.SUCCESS;
        } catch (error) {
          console.error('error making transfer: ', error);
          this.message = error.message || error;
          this.txState = TransactionConfirmationState.ERROR;
          this.mode = 'ERROR';
          this.modeChange.emit(this.mode);
        }
      } else if (this.asset.asset.chain === 'DOGE') {
        const dogeClient = this.user.clients.doge;

        try {
          // TODO -> consolidate this with BTC, BCH, LTC
          const asset = new AsgrsxAsset(`DOGE.DOGE`);
          const estimatedFee = this.txUtilsService.calculateNetworkFee(
            asset,
            inboundAddresses,
            'INBOUND'
          );
          const balanceAmount = this.userService.findRawBalance(
            this.balances,
            asset
          );
          const toBase = assetToBase(assetAmount(this.amount));
          const feeToBase = assetToBase(assetAmount(estimatedFee));
          const amount = balanceAmount
            // subtract fee
            .minus(feeToBase.amount())
            // subtract amount
            .minus(toBase.amount())
            .isGreaterThan(0)
            ? toBase.amount() // send full amount, fee can be deducted from remaining balance
            : toBase.amount().minus(feeToBase.amount()); // after deductions, not enough to process, subtract fee from amount

          if (amount.isLessThan(0)) {
            this.message = 'Insufficient funds. Try sending a smaller amount';
            this.txState = TransactionConfirmationState.ERROR;
            return;
          }
          console.log(amount,this.recipientAddress)
          const hash = await dogeClient.transfer({
            amount: baseAmount(amount),
            recipient: this.recipientAddress,
            feeRate: environment.network === 'testnet'? undefined : +matchingAddress.gas_rate,
          });
          console.log(hash)
          this.hash = hash;
          this.pushTxStatus(hash, this.asset.asset, false);
          this.makeHashes(this.asset.asset);
          this.transactionSuccessful.next();
          this.mode = 'SUCCESS';
          this.txState = TransactionConfirmationState.SUCCESS;
        } catch (error) {
          console.error('error making transfer: ', error);
          this.message = error.message || error;
          this.txState = TransactionConfirmationState.ERROR;
          this.mode = 'ERROR';
          this.modeChange.emit(this.mode);
        }
      } else if (this.asset.asset.chain === 'TERRA') {
        //TODO: doesn't work atm. will need to update the xchainjs-terra
        const terraClient = this.user.clients.terra;
        try {
          const estFee = await terraClient.getEstimatedFee({
            asset: this.asset.asset,
            feeAsset: this.asset.asset,
            memo: this.memo,
            sender: terraClient.getAddress(),
            recipient: this.recipientAddress,
            amount: assetToBase(assetAmount(this.amount, TERRA_DECIMAL)),
          })

          const hash = await terraClient.transfer({
            asset: this.asset.asset,
            amount: assetToBase(assetAmount(this.amount, TERRA_DECIMAL)),
            recipient: this.recipientAddress,
            estimatedFee: estFee
          });
          this.hash = hash;
          this.pushTxStatus(hash, this.asset.asset, false);
          this.makeHashes(this.asset.asset);
          this.transactionSuccessful.next();
          this.mode = 'SUCCESS';
          this.txState = TransactionConfirmationState.SUCCESS;
        }
        catch (error) {
          console.error('error making transfer: ', error);
          this.message = error.message || error;
          this.txState = TransactionConfirmationState.ERROR;
          this.mode = 'ERROR';
          this.modeChange.emit(this.mode);
        }
      }
    }
  }

  makeHashes(asset: Asset) {
    this.hashes = [
      {
        copy: this.hash,
        // eslint-disable-next-line prettier/prettier
        show: `${this.hash.substring(0, 6)}...${this.hash.substring( this.hash.length - 6, this.hash.length )}`,
        // eslint-disable-next-line prettier/prettier
        url: this.mockClientService.getMockClientByChain(asset.chain).getExplorerTxUrl(this.hash),
        asset: asset,
      },
    ];
  }

  pushTxStatus(hash: string, asset: Asset, isThorchainTx: boolean) {
    this.txStatusService.addTransaction({
      chain: asset.chain,
      ticker: asset.ticker,
      status: TxStatus.PENDING,
      action: TxActions.SEND,
      symbol: asset.symbol,
      isThorchainTx,
      hash,
      pollRpc: asset.chain === 'THOR',
    });
  }

  backNav() {
    let sendAmountUSD = this.amount * this.asset.assetPriceUSD;
    this.analytics.event(
      'wallet_asset_send_confirm',
      'button_cancel_*WALLET*_*ASSET*_usd_*numerical_usd_value*',
      sendAmountUSD,
      this.asset.asset.chain,
      assetString(this.asset.asset),
      sendAmountUSD.toString()
    );
    this.back.emit();
  }

  ngOnDestroy() {
    for (const sub of this.subs) {
      sub.unsubscribe();
    }
  }
}
