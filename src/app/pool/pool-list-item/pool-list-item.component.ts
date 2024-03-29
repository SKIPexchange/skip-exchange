import { Component, Input, OnChanges } from '@angular/core';
import { getPoolShare, PoolData, UnitData } from '@thorchain/asgardex-util';
import { assetToString, baseAmount } from '@xchainjs/xchain-util';
import BigNumber from 'bignumber.js';
import { Subscription } from 'rxjs';
import { take } from 'rxjs/operators';
import { Asset } from 'src/app/_classes/asset';
import { MemberPool } from 'src/app/_classes/member';
import { PoolDTO } from 'src/app/_classes/pool';
import { Currency } from 'src/app/_components/account-settings/currency-converter/currency-converter.component';
import { AnalyticsService } from 'src/app/_services/analytics.service';
import { PoolDetailService } from 'src/app/_services/pool-detail.service';
import {
  TransactionStatusService,
  Tx,
  TxActions,
} from 'src/app/_services/transaction-status.service';
import { UserService } from 'src/app/_services/user.service';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-pool-list-item',
  templateUrl: './pool-list-item.component.html',
  styleUrls: ['./pool-list-item.component.scss'],
})
export class PoolListItemComponent implements OnChanges {
  expanded: boolean;

  @Input() activate: boolean;
  @Input() currency: Currency;
  @Input() isMobile: boolean;

  /**
   * Pool Data
   */
  @Input() set poolData(data: PoolDTO) {
    this._poolData = data;
    this.setAsset();
  }
  get poolData() {
    return this._poolData;
  }
  _poolData: PoolDTO;

  @Input() depositsDisabled: boolean;

  pooledRune: number;
  pooledAsset: number;
  poolShare: number;

  asset: Asset;
  subs: Subscription[];

  isPending: Tx;
  isTestnet: boolean;
  assetDepth: number;
  hover: boolean = false;

  constructor(
    private poolDetailService: PoolDetailService,
    private txStatusService: TransactionStatusService,
    private userService: UserService,
    private analytics: AnalyticsService
  ) {
    this.expanded = false;
    this.activate = false;

    this.isTestnet = environment.network === 'testnet' ? true : false;
  }

  ngOnChanges() {
    this.getPoolShare();
  }

  ngOnInit(): void {
    const poolDetail$ = this.poolDetailService.activatedAsset$.subscribe(
      (asset) => {
        if (asset && this.asset) {
          this.activate =
            asset.symbol === this.asset.symbol &&
            asset.chain === this.asset.chain;
          this.getPoolShare();
        }
      }
    );

    const pendingTx$ = this.txStatusService.txs$.subscribe((tx) => {
      this.isPending = this.txStatusService.getPoolPedingTx().find((tx) => {
        return tx.symbol === this.asset.symbol;
      });
    });

    this.assetDepth =
      (new BigNumber(+this.poolData.assetDepth).div(10 ** 8).toNumber() *
        +this.poolData.assetPriceUSD +
        new BigNumber(+this.poolData.runeDepth).div(10 ** 8).toNumber() *
          +this.poolData.runePrice) *
      this.currency.value;

    this.subs = [poolDetail$, pendingTx$];
  }

  getPoolUrl() {
    return (
      'https://viewblock.io/thorchain/pool/' +
      assetToString(this.asset) +
      (this.isTestnet ? '?network=testnet' : '')
    );
  }

  toggleExpanded() {
    this.poolDetailService.setActivatedAsset(this.asset);
  }

  setAsset(): void {
    if (this.poolData) {
      this.asset = new Asset(this.poolData.asset);
    }
  }

  getPoolShare(): void {
    if (this.poolData) {
      const pooledDayAverage =
        new BigNumber(+this.poolData.volume24h).div(10 ** 8).toNumber() *
        this.poolData?.runePrice *
        this.currency.value;

      if (this.activate) {
        this.poolDetailService.setPooledDetails({
          poolType: 'notMember',
          pooledAsset: this.asset,
          pooledDepth: this.assetDepth,
          pooledDayAverage,
        });
      }
    }
  }

  statEvent() {
    this.userService.user$.pipe(take(1)).subscribe((user) => {
      if (user) {
        this.analytics.event(
          'pool_select',
          'tag_pool_stats_*POOL_ASSET*',
          undefined,
          `${this.asset.chain}.${this.asset.ticker}`
        );
      } else {
        this.analytics.event(
          'pool_disconnected',
          'tag_stats_*POOL*',
          undefined,
          `${this.asset.chain}.${this.asset.ticker}`
        );
      }
    });
  }

  depositEvent() {
    this.userService.user$.pipe(take(1)).subscribe((user) => {
      if (user) {
        this.analytics.event(
          'pool_select',
          'tag_pool_deposit_*POOL_ASSET*',
          undefined,
          `${this.asset.chain}.${this.asset.ticker}`
        );
      } else {
        this.analytics.event(
          'pool_disconnected',
          'tag_deposit_*POOL*',
          undefined,
          `${this.asset.chain}.${this.asset.ticker}`
        );
      }
    });
  }

  isWithdraw(action: TxActions): boolean {
    return action == TxActions.WITHDRAW;
  }

  ngOnDestroy(): void {
    for (const sub of this.subs) {
      sub.unsubscribe();
    }

    // guard to see the staked list item goes away
    if (this.activate) this.poolDetailService.setActivatedAsset(null);
  }
}
