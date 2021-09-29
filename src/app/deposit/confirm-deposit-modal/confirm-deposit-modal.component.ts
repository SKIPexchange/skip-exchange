import {
  Component,
  OnInit,
  Inject,
  OnDestroy,
  Input,
  Output,
  EventEmitter,
} from '@angular/core';
import { assetToString, bn, Chain } from '@xchainjs/xchain-util';
import { Subscription } from 'rxjs';
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
import { Balance } from '@xchainjs/xchain-client';
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
import { Transaction } from 'src/app/_classes/transaction';
import { CurrencyService } from 'src/app/_services/currency.service';
import { Currency } from 'src/app/_components/account-settings/currency-converter/currency-converter.component';
import { LayoutObserverService } from 'src/app/_services/layout-observer.service';
import { noticeData } from 'src/app/_components/success-notice/success-notice.component';
import { MockClientService } from 'src/app/_services/mock-client.service';
import { SuccessModal } from 'src/app/_components/transaction-success-modal/transaction-success-modal.component';
import { TranslateService } from 'src/app/_services/translate.service';

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
  depositValue: number;
  slip?: number;
  slippageTolerance?: number;
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
  balances: Balance[];
  metaMaskProvider?: ethers.providers.Web3Provider;
  depositSuccess: boolean;
  outboundHash: string;
  currency: Currency;
  isMobile: boolean;
  hashes: noticeData[] = [];
  successMessage: string = 'processing';

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
    private metaMaskService: MetamaskService,
    private curService: CurrencyService,
    private layout: LayoutObserverService,
    private mockClientService: MockClientService,
    public translate: TranslateService
  ) {
    this.depositSuccess = false;
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

    const cur$ = this.curService.cur$.subscribe((cur) => {
      this.currency = cur;
    });

    const layout$ = this.layout.isMobile.subscribe((res) => {
      this.isMobile = res;
    });

    this.subs = [user$, balances$, metaMaskProvider$, cur$, layout$];
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

  makeHash(hash: string, asset: Asset, isThorchainTx: boolean = false) {
    if (isThorchainTx === true) {
      if (asset.chain === Chain.Ethereum) {
        hash = this.ethUtilsService.strip0x(hash);
      }
      this.hashes.push({
        copy: hash,
        // eslint-disable-next-line prettier/prettier
        show: `${hash.substring(0, 3)}...${hash.substring(hash.length - 3, hash.length)}`,
        // eslint-disable-next-line prettier/prettier
        url: this.mockClientService.getMockClientByChain(Chain.THORChain).getExplorerTxUrl(hash),
        asset: this.data.rune.asset,
      });
    } else {
      this.hashes.push({
        copy: hash,
        // eslint-disable-next-line prettier/prettier
        show: `${hash.substring(0, 3)}...${hash.substring(hash.length - 3, hash.length)}`,
        // eslint-disable-next-line prettier/prettier
        url: this.mockClientService.getMockClientByChain(asset.chain).getExplorerTxUrl(hash),
        asset: asset,
      });
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
          this.makeHash(hash, this.data.asset.asset);
          this.makeHash(hash, this.data.asset.asset, true);
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
      this.data.user?.type === 'XDEFI' ||
      this.data.user?.type === 'walletconnect'
    ) {
      const clients = this.data.user.clients;
      const thorClient = clients.thorchain;
      let assetHash = '';

      switch (this.data.poolTypeOption) {
        case 'SYM':
          try {
            assetHash = await this.keystoreDepositAsset(pools);
            console.log('asset hash is: ', assetHash);
            this.makeHash(assetHash, this.data.asset.asset);
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
            this.makeHash(runeHash, this.data.rune.asset);
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
            this.makeHash(assetHash, this.data.asset.asset);
            this.makeHash(assetHash, this.data.asset.asset, true);
            this.assetDepositSuccess(this.data.asset.asset, assetHash);
            this.txState = TransactionConfirmationState.SUCCESS;
          } catch (error) {
            console.error('error making token transfer: ', error);
            this.txState = TransactionConfirmationState.ERROR;
            this.error = error.message || error;
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
            this.makeHash(runeHash, this.data.rune.asset);
            this.runeDepositSuccess(runeHash);
            break;
          } catch (error) {
            console.error('error making RUNE transfer: ', error);
            this.txState = TransactionConfirmationState.ERROR;
            this.error = error.message || error;
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
    const thorchainAddress = await thorClient?.getAddress();
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
  }

  getOutboundSuccess(hash: string) {
    // see if midgard gets the tx success
    this.txStatusService.getOutboundHash(hash).subscribe((res: Transaction) => {
      if (res.status === 'success') {
        this.successMessage = 'loading balance';
        this.userService.fetchBalances(() => {
          this.depositSuccess = true;
          this.successMessage = 'success';
        });

        //updates amount
        this.data.runeAmount = bn(
          res.in
            .find((inTX) =>
              inTX.coins.find(
                (c) =>
                  c.asset ===
                  `${this.data.rune.asset.chain}.${this.data.rune.asset.ticker}`
              )
            )
            ?.coins.find(
              (c) =>
                c.asset ===
                `${this.data.rune.asset.chain}.${this.data.rune.asset.ticker}`
            ).amount
        )
          .div(10 ** 8)
          .toNumber();

        //updates asset amount
        this.data.assetAmount = bn(
          res.in
            .find((inTX) =>
              inTX.coins.find(
                (c) => c.asset === assetToString(this.data.asset.asset)
              )
            )
            ?.coins.find(
              (c) => c.asset === assetToString(this.data.asset.asset)
            ).amount
        )
          .div(10 ** 8)
          .toNumber();
      }
    });
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

    if (this.data.asset.asset.chain === 'ETH') {
      hash = this.ethUtilsService.strip0x(hash);
    }
    this.getOutboundSuccess(hash);
  }

  assetDepositError(error: string) {
    this.txState = TransactionConfirmationState.ERROR;
    this.error = error;
  }

  runeDepositSuccess(runeHash: string) {
    this.hash = runeHash;
    this.txStatusService.addTransaction({
      chain: Chain.THORChain,
      hash: runeHash,
      ticker: `RUNE`,
      status: TxStatus.PENDING,
      action: TxActions.DEPOSIT,
      symbol: this.data.asset.asset.symbol,
      isThorchainTx: true,
    });

    this.getOutboundSuccess(runeHash);
    this.txState = TransactionConfirmationState.SUCCESS;
  }

  withdrawSuccess(hash: string) {
    this.hash = hash;
    this.txStatusService.addTransaction({
      chain: Chain.THORChain,
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
      return this.translate.format('common.confirm');
    }
  }

  getSuccessData(): SuccessModal {
    let assets = [];
    let amounts = [];
    if (this.data.poolTypeOption === 'ASYM_ASSET') {
      assets = [this.data.asset];
      amounts = [this.data.assetAmount];
    } else if (this.data.poolTypeOption === 'ASYM_RUNE') {
      assets = [this.data.rune];
      amounts = [this.data.runeAmount];
    } else {
      assets = [this.data.asset, this.data.rune];
      amounts = [this.data.assetAmount, this.data.runeAmount];
    }
    // prettier-ignore
    return {
      modalType: 'DEPOSIT',
      poolType: this.data.poolTypeOption,
      asset: assets, 
      label: this.depositSuccess ? [this.translate.format('pending.deposited'), this.translate.format('pending.deposited')] : [this.translate.format('pending.depostiting'), this.translate.format('pending.depostiting')],
      amount: amounts, 
      balances: this.balances,
      hashes: this.hashes,
      isPlus: true,
      isPending: this.depositSuccess ? [false, false] : [true, true]
    };
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
