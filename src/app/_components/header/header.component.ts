import {
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  SimpleChange,
} from '@angular/core';
import { combineLatest, Subscription } from 'rxjs';
import { User } from 'src/app/_classes/user';
import { MidgardService } from 'src/app/_services/midgard.service';
import {
  MainViewsEnum,
  OverlaysService,
} from 'src/app/_services/overlays.service';
import { PhraseConfirmService } from 'src/app/_services/phrase-confirm.service';
import { UserService } from 'src/app/_services/user.service';
import { environment } from 'src/environments/environment';
import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { AnalyticsService } from 'src/app/_services/analytics.service';
import { Router } from '@angular/router';
import { Chain } from '@xchainjs/xchain-util';
import { TranslateService } from 'src/app/_services/translate.service';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  providers: [DecimalPipe],
})
export class HeaderComponent implements OnDestroy {
  isTestnet: boolean;
  isMainnetSkin: boolean;
  user: User;
  subs: Subscription[];
  //uses for hiding in confirmation view
  isUnderstood: boolean;
  topbar: string;
  totalPooledRune: number;
  totalActiveBond: number;
  maxLiquidityRune: number;
  depositsDisabled: boolean;
  error: boolean;
  appLocked: boolean;

  private _overlay: boolean;
  get overlay(): boolean {
    return this._overlay;
  }
  @Input() set overlay(value: boolean) {
    this._overlay = value;
    this.overlayChange.emit(value);
  }
  @Output() overlayChange = new EventEmitter<boolean>();

  constructor(
    private userService: UserService,
    public overlaysService: OverlaysService,
    private phraseConfirm: PhraseConfirmService,
    private midgardService: MidgardService,
    private _decimalPipe: DecimalPipe,
    private analytics: AnalyticsService,
    private router: Router,
    private translate: TranslateService
  ) {
    this.appLocked = environment.appLocked;
    this.isTestnet = environment.network === 'testnet' ? true : false;

    const user$ = this.userService.user$.subscribe(
      (user) => (this.user = user)
    );

    const confirm$ = this.phraseConfirm.isUnderStood$.subscribe(
      (isUnderstood: boolean) => {
        this.isUnderstood = isUnderstood;
      }
    );

    this.subs = [user$, confirm$];
  }

  ngOnInit(): void {
    this.getPoolCap();
  }

  gotoSwap() {
    this.analytics.event('navigation', 'image_logo');
    if (this.isUnderstood) {
      this.overlaysService.setViews(MainViewsEnum.Swap, 'Swap');
      this.router.navigate(['/', 'swap']);
    }
  }

  walletConnectUpgrade() {
    return (
      this.user.type === 'walletconnect' &&
      this.userService.clientAvailableChains().includes(Chain.THORChain)
    );
  }

  getPoolCap() {
    const mimir$ = this.midgardService.mimir$;
    const network$ = this.midgardService.network$;
    const combined = combineLatest([mimir$, network$]);

    if (this.appLocked) {
      this.topbar = this.translate.format('header.maintenance');
      return;
    }

    this.topbar = this.translate.format('header.loading');
    const sub = combined.subscribe(([mimir, network]) => {
      if (
        network instanceof HttpErrorResponse ||
        mimir instanceof HttpErrorResponse
      ) {
        this.topbar = this.translate.format('header.midgardError');
        this.depositsDisabled = false;
        this.error = true;
        return;
      }

      this.error = false;
      this.totalActiveBond = +network?.bondMetrics?.totalActiveBond;
      this.totalPooledRune = +network?.totalPooledRune;
      if (
        this.totalActiveBond &&
        this.totalPooledRune != null &&
        this.totalPooledRune != NaN
      ) {
        const incentivePendulum = (this.totalPooledRune * 2) / this.totalActiveBond;
        this.depositsDisabled = this.totalPooledRune >= this.totalActiveBond;
        let incentivePendulumText = '';
        if (incentivePendulum === 1) {
          incentivePendulumText = 'Ideal'
        }
        else if (incentivePendulum <= 1) {
          incentivePendulumText = 'Under Bonded'
        }
        else if (incentivePendulum >= 1) {
          incentivePendulumText = 'Over Bonded'
        }

        this.topbar = this.translate.format('header.incentivePendulum', {
          status: incentivePendulumText,
        });

        if (this.depositsDisabled) {
          this.topbar += this.translate.format('header.depositDisabled');
        }
      }
    });

    this.subs.push(sub);
  }

  ngOnChanges(changes: SimpleChange) {
    for (const propName in changes) {
      const changedProp = changes[propName];
      const to = JSON.stringify(changedProp.currentValue);
    }
  }

  ngOnDestroy() {
    for (const sub of this.subs) {
      sub.unsubscribe();
    }
  }
}
