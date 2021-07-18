import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { Asset } from 'src/app/_classes/asset';
import { MemberPool } from 'src/app/_classes/member';
import { PoolDTO } from 'src/app/_classes/pool';
import { Currency } from 'src/app/_components/account-settings/currency-converter/currency-converter.component';
import { CurrencyService } from 'src/app/_services/currency.service';
import {
  RuneYieldPoolResponse,
  RuneYieldService,
} from 'src/app/_services/rune-yield.service';
import { UserService } from 'src/app/_services/user.service';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-staked-pools-list',
  templateUrl: './staked-pools-list.component.html',
  styleUrls: ['./staked-pools-list.component.scss'],
})
export class StakedPoolsListComponent implements OnDestroy {
  activePool: PoolDTO;

  @Input() runePrice: number;
  @Input() set pools(pools: PoolDTO[]) {
    this._pools = pools;
    this.mapPools();
  }
  get pools() {
    return this._pools;
  }
  _pools: PoolDTO[];
  @Input() depositsDisabled: boolean;

  @Input() set memberPools(memberPools: MemberPool[]) {
    this._memberPools = memberPools;
    this.mapPools();
  }
  get memberPools() {
    return this._memberPools;
  }
  _memberPools: MemberPool[];

  mappedPools: {
    poolData: PoolDTO;
    memberData: MemberPool[];
  }[];

  notMamberPools: PoolDTO[];
  currency: Currency;
  subs: Subscription[];
  runeYieldPools: RuneYieldPoolResponse[];

  constructor(
    private currencyService: CurrencyService,
    private runeYieldService: RuneYieldService,
    private userService: UserService
  ) {
    const cur$ = this.currencyService.cur$.subscribe((cur) => {
      this.currency = cur;
    });

    this.subs = [cur$];
  }

  mapPools() {
    if (this.pools && this.memberPools) {
      this.mappedPools = [];
      [...new Set(this.memberPools.map((el) => el.pool))].forEach(
        (memberPool) => {
          this.mappedPools.push({
            poolData: {
              ...this.pools.find((pool) => pool.asset === memberPool),
              runePrice: this.runePrice,
            },
            memberData: this.memberPools.filter(
              (existingPool) => existingPool.pool === memberPool
            ),
          });
        }
      );

      this.mappedPools.sort((a, b) =>
        a.poolData.asset > b.poolData.asset
          ? 1
          : b.poolData.asset > a.poolData.asset
          ? -1
          : 0
      );
    }

    if (this.pools && this.memberPools) {
      this.notMamberPools = [] as PoolDTO[];
      this.pools.forEach((pool) => {
        if (this.memberPools?.find((p) => p.pool === pool.asset)) {
          return;
        }
        this.notMamberPools.push({ ...pool, runePrice: this.runePrice });
      });

      this.notMamberPools.sort((a, b) =>
        a.asset > b.asset ? 1 : b.asset > a.asset ? -1 : 0
      );

      if (environment.network !== 'testnet') {
        this.runeYieldService
          .getCurrentValueOfPool([
            this.memberPools[0]?.runeAddress,
            this.memberPools[0]?.assetAddress,
          ])
          ?.subscribe((pools) => {
            this.runeYieldPools = pools;
          });
      }
    }
  }

  chainAvaiable(asset: string) {
    const chain = new Asset(asset).chain;
    const clients = this.userService.clientAvailableChains();

    // no users because there is no available clients
    if (!clients) return false;

    return clients.includes(chain);
  }

  ngOnDestroy(): void {
    this.subs.forEach((sub) => sub.unsubscribe());
  }
}
