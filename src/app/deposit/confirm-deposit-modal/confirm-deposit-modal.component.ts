import {
  Component,
  OnInit,
  Inject,
  OnDestroy,
  Input,
  Output,
  EventEmitter,
} from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { assetToString } from '@xchainjs/xchain-util';
import { Subscription, timer } from 'rxjs';
import { PoolAddressDTO } from 'src/app/_classes/pool-address';
import { User } from 'src/app/_classes/user';
import { TransactionConfirmationState } from 'src/app/_const/transaction-confirmation-state';
import { MidgardService } from 'src/app/_services/midgard.service';
import { UserService } from 'src/app/_services/user.service';
import {
  TransactionStatusService,
  TxActions,
  TxStatus,
} from 'src/app/_services/transaction-status.service';
import { EthUtilsService } from 'src/app/_services/eth-utils.service';
import { OverlaysService } from 'src/app/_services/overlays.service';
import { Router } from '@angular/router';
import { Balances } from '@xchainjs/xchain-client';
import { AssetAndBalance } from 'src/app/_classes/asset-and-balance';
import { KeystoreDepositService } from 'src/app/_services/keystore-deposit.service';
import { Asset } from 'src/app/_classes/asset';
import {
  AnalyticsService,
  assetString,
} from 'src/app/_services/analytics.service';
import { switchMap, takeWhile } from 'rxjs/operators';
import { PoolTypeOption } from 'src/app/_const/pool-type-options';
import { Client } from '@xchainjs/xchain-thorchain';
import { MetamaskService } from 'src/app/_services/metamask.service';
import { ethers } from 'ethers';

// assets should be added for asset-input as designed.
export interface ConfirmDepositData {
  asset: AssetAndBalance;
  rune: AssetAndBalance;
  assetAmount: number;
  runeAmount: number;
  user: User;
  runeBasePrice: number;
  assetBasePrice: number;
  runeBalance: number;
  assetBalance: number;
  runePrice: number;
  assetPrice: number;
  estimatedFee: number;
  runeFee: number;
  poolTypeOption: PoolTypeOption;
}

@Component({
  selector: 'app-confirm-deposit-modal',
  templateUrl: './confirm-deposit-modal.component.html',
  styleUrls: ['./confirm-deposit-modal.component.scss'],
})
export class ConfirmDepositModalComponent implements OnInit, OnDestroy {
  txState: TransactionConfirmationState | 'RETRY_RUNE_DEPOSIT';
  hash: string;
  subs: Subscription[];
  error: string;
  insufficientChainBalance: boolean;
  loading: boolean;
  estimatedMinutes: number;
  balances: Balances;
  metaMaskProvider?: ethers.providers.Web3Provider;

  //foe this interface it should be imported from despoit page
  @Input() data: ConfirmDepositData;
  @Output() close: EventEmitter<boolean> = new EventEmitter<boolean>();

  constructor(
    private txStatusService: TransactionStatusService,
    private midgardService: MidgardService,
    private ethUtilsService: EthUtilsService,
    private userService: UserService,
    private overlaysService: OverlaysService,
    private router: Router,
    private analyticsService: AnalyticsService,
    private keystoreDepositService: KeystoreDepositService,
    private metaMaskService: MetamaskService
  ) {
    this.loading = true;
    this.txState = TransactionConfirmationState.PENDING_CONFIRMATION;
    const user$ = this.userService.user$.subscribe((user) => {
      if (!user) {
        this.closeDialog();
      }
    });

    const metaMaskProvider$ = this.metaMaskService.provider$.subscribe(
      (provider) => (this.metaMaskProvider = provider)
    );

    const balances$ = this.userService.userBalances$.subscribe(
      (balances) => (this.balances = balances)
    );

    this.subs = [user$, balances$, metaMaskProvider$];
  }

  ngOnInit(): void {
    this.estimateTime();
    this.loading = false;
  }

  async estimateTime() {
    if (
      this.data.asset.asset.chain === 'ETH' &&
      this.data.asset.asset.symbol !== 'ETH'
    ) {
      this.estimatedMinutes = await this.ethUtilsService.estimateERC20Time(
        assetToString(this.data.asset.asset),
        this.data.assetAmount
      );
    } else {
      this.estimatedMinutes = this.txStatusService.estimateTime(
        this.data.asset.asset.chain,
        this.data.assetAmount
      );
    }
  }

  submitTransaction(): void {
    this.txState = TransactionConfirmationState.SUBMITTING;

    this.midgardService.getInboundAddresses().subscribe(async (res) => {
      if (res && res.length > 0) {
        this.deposit(res);
      }
    });

    let depositAmountUSD =
      this.data.runeAmount * this.data.runePrice +
      this.data.assetAmount * this.data.assetPrice;
    this.analyticsService.event(
      'pool_deposit_symmetrical_confirm',
      'button_deposit_confirm_symmetrical_*POOL_ASSET*_usd_*numerical_usd_value*',
      depositAmountUSD,
      assetString(this.data.asset.asset),
      depositAmountUSD.toString()
    );

    let depositFeeAmountUSD =
      this.data.runeFee * this.data.runePrice +
      this.data.estimatedFee * this.data.assetPrice;
    this.analyticsService.event(
      'pool_deposit_symmetrical_confirm',
      'button_deposit_confirm_symmetrical_*POOL_ASSET*_fee_usd_*numerical_usd_value*',
      depositFeeAmountUSD,
      assetString(this.data.asset.asset),
      depositFeeAmountUSD.toString()
    );
  }

  async deposit(pools: PoolAddressDTO[]) {
    const clients = this.data.user.clients;
    const asset = this.data.asset.asset;

    if (this.data.user?.type === 'metamask') {
      try {
        const hash = await this.metaMaskDepositAsset(pools);
        if (hash && hash.length > 0) {
          this.hash = hash;
          this.assetDepositSuccess(this.data.asset.asset, hash);
          this.txState = TransactionConfirmationState.SUCCESS;
        } else {
          this.assetDepositError('Deposit Unsuccessful');
          return;
        }
      } catch (error) {
        this.txState = TransactionConfirmationState.ERROR;
        this.error = error;
      }
    } else if (
      this.data.user?.type === 'keystore' ||
      this.data.user?.type === 'XDEFI'
    ) {
      const clients = this.data.user.clients;
      const thorClient = clients.thorchain;
      let assetHash = '';

      switch (this.data.poolTypeOption) {
        case 'SYM':
          try {
            assetHash = await this.keystoreDepositAsset(pools);
            console.log('asset hash is: ', assetHash);
          } catch (error) {
            console.error('error making token transfer: ', error);
            this.txState = TransactionConfirmationState.ERROR;
            this.error = error;
            return;
          }

          if (!assetHash || assetHash.length <= 0) {
            this.assetDepositError('Deposit Unsuccessful');
            return;
          }

          this.assetDepositSuccess(this.data.asset.asset, assetHash);

          try {
            const runeHash = await this.depositRune(
              thorClient,
              this.data.asset.asset
            );
            console.log('rune hash is: ', runeHash);
            this.runeDepositSuccess(runeHash);
          } catch (error) {
            console.error('error making RUNE transfer: ', error);
            this.txState = 'RETRY_RUNE_DEPOSIT';
            this.error = error;
            return;
          }
          break;

        case 'ASYM_ASSET':
          try {
            assetHash = await this.keystoreDepositAsset(pools);
            this.hash = assetHash;

            if (!assetHash || assetHash.length <= 0) {
              this.assetDepositError('Deposit Unsuccessful');
              return;
            }

            console.log('asset hash is: ', assetHash);
            this.assetDepositSuccess(this.data.asset.asset, assetHash);
            this.txState = TransactionConfirmationState.SUCCESS;
          } catch (error) {
            console.error('error making token transfer: ', error);
            this.txState = TransactionConfirmationState.ERROR;
            this.error = error;
            return;
          }
          break;

        case 'ASYM_RUNE':
          // const assetHash = await this.assetDeposit(pools);
          try {
            const runeHash = await this.depositRune(
              thorClient,
              this.data.asset.asset
            );
            console.log('rune hash is: ', runeHash);
            this.runeDepositSuccess(runeHash);
            break;
          } catch (error) {
            console.error('error making RUNE transfer: ', error);
            this.txState = 'RETRY_RUNE_DEPOSIT';
            this.error = error;
            return;
          }
      }
    }
  }

  async metaMaskDepositAsset(pools: PoolAddressDTO[]) {
    const asset = this.data.asset.asset;
    if (asset.chain !== 'ETH') {
      this.txState = TransactionConfirmationState.ERROR;
      this.error = `Metamask cannot deposit ${asset.chain}`;
      return;
    }

    // find recipient pool
    const recipientPool = pools.find((pool) => pool.chain === 'ETH');
    if (!recipientPool) {
      this.txState = TransactionConfirmationState.ERROR;
      this.error = `Error fetching recipient pool`;
      return;
    }

    if (!this.metaMaskProvider) {
      this.txState = TransactionConfirmationState.ERROR;
      this.error = `MetaMask Provider not found`;
      return;
    }

    const memo = `+:${asset.chain}.${asset.symbol}`;
    const userAddress = this.data.user.wallet;
    const signer = this.metaMaskProvider.getSigner();

    try {
      const hash = await this.metaMaskService.callDeposit({
        ethInboundAddress: recipientPool,
        asset,
        input: this.data.assetAmount,
        memo,
        userAddress,
        signer,
      });

      return hash;
    } catch (error) {
      this.txState = TransactionConfirmationState.ERROR;
      this.error = `Error depositing`;
    }
  }

  async keystoreDepositAsset(pools: PoolAddressDTO[]) {
    const clients = this.data.user.clients;
    const thorClient = clients.thorchain;
    const thorchainAddress = await thorClient.getAddress();
    let hash = '';

    // get token address
    const address = this.userService.getTokenAddress(
      this.data.user,
      this.data.asset.asset.chain
    );
    if (!address || address === '') {
      console.error('no address found');
      return;
    }

    // find recipient pool
    const recipientPool = pools.find(
      (pool) => pool.chain === this.data.asset.asset.chain
    );
    if (!recipientPool) {
      console.error('no recipient pool found');
      return;
    }

    // Deposit token
    try {
      // deposit using xchain
      switch (this.data.asset.asset.chain) {
        case 'BNB':
          hash = await this.keystoreDepositService.binanceDeposit({
            asset: this.data.asset.asset as Asset,
            inputAmount: this.data.assetAmount,
            client: this.data.user.clients.binance,
            poolType: this.data.poolTypeOption,
            thorchainAddress,
            recipientPool,
          });
          break;

        case 'BTC':
          hash = await this.keystoreDepositService.bitcoinDeposit({
            asset: this.data.asset.asset as Asset,
            inputAmount: this.data.assetAmount,
            client: this.data.user.clients.bitcoin,
            balances: this.balances,
            thorchainAddress,
            recipientPool,
            estimatedFee: this.data.estimatedFee,
            poolType: this.data.poolTypeOption,
          });
          break;

        case 'LTC':
          hash = await this.keystoreDepositService.litecoinDeposit({
            asset: this.data.asset.asset as Asset,
            inputAmount: this.data.assetAmount,
            client: this.data.user.clients.litecoin,
            balances: this.balances,
            thorchainAddress,
            recipientPool,
            estimatedFee: this.data.estimatedFee,
            poolType: this.data.poolTypeOption,
          });
          break;

        case 'BCH':
          hash = await this.keystoreDepositService.bchDeposit({
            asset: this.data.asset.asset as Asset,
            inputAmount: this.data.assetAmount,
            client: this.data.user.clients.bitcoinCash,
            balances: this.balances,
            thorchainAddress,
            recipientPool,
            estimatedFee: this.data.estimatedFee,
            poolType: this.data.poolTypeOption,
          });

          break;

        case 'ETH':
          hash = await this.keystoreDepositService.ethereumDeposit({
            asset: this.data.asset.asset as Asset,
            inputAmount: this.data.assetAmount,
            balances: this.balances,
            client: this.data.user.clients.ethereum,
            thorchainAddress,
            recipientPool,
            poolType: this.data.poolTypeOption,
          });
          break;

        default:
          console.error(`${this.data.asset.asset.chain} does not match`);
          return;
      }

      if (hash === '') {
        console.error('no hash set');
        return;
      }
      return hash;
    } catch (error) {
      console.error('error making token transfer: ', error);
      this.txState = TransactionConfirmationState.ERROR;
      this.error = error.message || error;
      return;
    }
  }

  async depositRune(thorClient: Client, asset: Asset): Promise<string> {
    // deposit RUNE
    try {
      const address = this.userService.getTokenAddress(
        this.data.user,
        this.data.asset.asset.chain
      );
      if (!address || address === '') {
        throw new Error('No Address Found');
      }

      const runeHash = await this.keystoreDepositService.runeDeposit({
        client: thorClient,
        inputAmount: this.data.runeAmount,
        memo:
          this.data.poolTypeOption === 'SYM'
            ? `+:${asset.chain}.${asset.symbol}:${address}`
            : `+:${asset.chain}.${asset.symbol}`,
      });

      return runeHash;
    } catch (error) {
      console.error('error making RUNE transfer: ', error);
      this.txState = 'RETRY_RUNE_DEPOSIT';
      this.error = error.message || error;
      return;
    }
  }

  assetDepositError(error: string) {
    this.txState = TransactionConfirmationState.ERROR;
    this.error = error;
  }

  assetDepositSuccess(asset: Asset, hash: string) {
    this.txStatusService.addTransaction({
      chain: asset.chain,
      hash,
      ticker: `${this.data.asset.asset.ticker}`,
      status: TxStatus.PENDING,
      action: TxActions.DEPOSIT,
      symbol: this.data.asset.asset.symbol,
      isThorchainTx: this.data.poolTypeOption === 'SYM' ? false : true,
    });
  }

  runeDepositSuccess(runeHash: string) {
    this.hash = runeHash;
    this.txStatusService.addTransaction({
      chain: 'THOR',
      hash: runeHash,
      ticker: `RUNE`,
      status: TxStatus.PENDING,
      action: TxActions.DEPOSIT,
      symbol: this.data.asset.asset.symbol,
      isThorchainTx: true,
    });

    //temporary patch for successing of both transfers in deposit
    console.log('rune hash', runeHash);
    timer(0, 10000).pipe(
      switchMap(() => this.midgardService.getTransaction(runeHash)),
      takeWhile((res) => {
        console.log('this is the result', res);
        for (const resTx of res.actions) {
          if (resTx.status.toUpperCase() === 'SUCCESS') {
            this.analyticsService.event(
              'pool_deposit_symmetrical_success',
              'tag_deposited_asset_container_wallet_*POOL_ASSET*',
              undefined,
              assetToString(this.data.asset.asset)
            );
            this.analyticsService.event(
              'pool_deposit_symmetrical_success',
              'tag_deposited_wallet_THOR.RUNE'
            );
            return false;
          }
        }
        return true;
      })
    );

    this.txState = TransactionConfirmationState.SUCCESS;
  }

  withdrawSuccess(hash: string) {
    this.hash = hash;
    this.txStatusService.addTransaction({
      chain: 'THOR',
      hash,
      ticker: `${this.data.asset.asset.ticker}-RUNE`,
      status: TxStatus.PENDING,
      action: TxActions.WITHDRAW,
      symbol: this.data.asset.asset.symbol,
      isThorchainTx: true,
      pollThornodeDirectly: true,
    });
    this.txState = TransactionConfirmationState.SUCCESS;
  }

  breadcrumbNav(nav: string, type: 'pending' | 'success' | 'process') {
    if (nav === 'pool') {
      this.router.navigate(['/', 'pool']);
      if (type === 'pending')
        this.analyticsService.event(
          'pool_deposit_symmetrical_confirm',
          'breadcrumb_pools'
        );
      else if (type === 'process')
        this.analyticsService.event(
          'pool_deposit_symmetrical_processing',
          'breadcrumb_pools'
        );
      else if (type === 'success')
        this.analyticsService.event(
          'pool_deposit_symmetrical_success',
          'breadcrumb_pools'
        );
    } else if (nav === 'swap') {
      this.router.navigate(['/', 'swap']);
      if (type === 'pending')
        this.analyticsService.event(
          'pool_deposit_symmetrical_confirm',
          'breadcrumb_skip'
        );
      else if (type === 'process')
        this.analyticsService.event(
          'pool_deposit_symmetrical_processing',
          'breadcrumb_skip'
        );
      else if (type === 'success')
        this.analyticsService.event(
          'pool_deposit_symmetrical_success',
          'breadcrumb_skip'
        );
    } else if (nav === 'deposit') {
      this.router.navigate([
        '/',
        'deposit',
        `${this.data.asset.asset.chain}.${this.data.asset.asset.symbol}`,
      ]);
    } else if (nav === 'deposit-back') {
      this.overlaysService.setCurrentDepositView('Deposit');
    }
  }

  getMessage(): string {
    if (this.error) {
      return this.error;
    } else {
      return 'confirm';
    }
  }

  closeDialog(transactionSucess?: boolean) {
    let depositAmountUSD =
      this.data.runeAmount * this.data.runePrice +
      this.data.assetAmount * this.data.assetPrice;
    this.analyticsService.event(
      'pool_deposit_symmetrical_confirm',
      'button_deposit_cancel_symmetrical_*POOL_ASSET*_usd_*numerical_usd_value*',
      depositAmountUSD,
      assetString(this.data.asset.asset),
      depositAmountUSD.toString()
    );

    let depositFeeAmountUSD =
      this.data.runeFee * this.data.runePrice +
      this.data.estimatedFee * this.data.assetPrice;
    this.analyticsService.event(
      'pool_deposit_symmetrical_confirm',
      'button_deposit_cancel_symmetrical_*POOL_ASSET*_fee_usd_*numerical_usd_value*',
      depositFeeAmountUSD,
      assetString(this.data.asset.asset),
      depositFeeAmountUSD.toString()
    );

    this.close.emit(transactionSucess);
  }

  closeToPool() {
    this.router.navigate(['/', 'pool']);
  }

  ngOnDestroy() {
    for (const sub of this.subs) {
      sub.unsubscribe();
    }
  }
}
