import {
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { getChainAsset } from 'src/app/_classes/asset';
import { AssetAndBalance } from 'src/app/_classes/asset-and-balance';
import { PoolAddressDTO } from 'src/app/_classes/pool-address';
import { User } from 'src/app/_classes/user';
import {
  MainViewsEnum,
  OverlaysService,
} from 'src/app/_services/overlays.service';
import { MidgardService } from 'src/app/_services/midgard.service';
import { TransactionUtilsService } from 'src/app/_services/transaction-utils.service';
import { UserService } from 'src/app/_services/user.service';
import { XChainClient } from '@xchainjs/xchain-client';
import {
  AnalyticsService,
  assetString,
} from 'src/app/_services/analytics.service';
import { TranslateService } from 'src/app/_services/translate.service';
import { environment } from 'src/environments/environment';
import { Chain } from '@xchainjs/xchain-util';

@Component({
  selector: 'app-send-asset',
  templateUrl: './send-asset.component.html',
  styleUrls: ['./send-asset.component.scss'],
})
export class SendAssetComponent implements OnInit, OnDestroy {
  @Output() back: EventEmitter<null>;
  @Output() confirmSend: EventEmitter<{
    amount: number;
    recipientAddress: string;
    memo: string;
  }>;
  @Input() asset: AssetAndBalance;

  message: string;

  get amount() {
    return this._amount;
  }
  set amount(val: number) {
    this._amount = val;
    if (!val) this._amount = 0;
    this.checkSpendable();
  }
  private _amount: number;
  _recipientAddress: string;
  get recipientAddress() {
    return this._recipientAddress;
  }
  set recipientAddress(addr: string) {
    this._recipientAddress = addr;
  }
  chainBalance: number;
  balance: number;
  amountSpendable: boolean;
  user: User;
  subs: Subscription[];
  explorerPath: string;
  address: string;
  isMaxError: boolean;
  client: XChainClient;

  memo: string;
  inboundAddresses: PoolAddressDTO[];

  constructor(
    private userService: UserService,
    private overlaysService: OverlaysService,
    private midgardService: MidgardService,
    private txUtilsService: TransactionUtilsService,
    private analytics: AnalyticsService,
    public translate: TranslateService
  ) {
    this.recipientAddress = '';
    this.memo = '';
    this.back = new EventEmitter<null>();
    this.confirmSend = new EventEmitter<{
      amount: number;
      recipientAddress: string;
      memo: string;
    }>();
    this.amountSpendable = false;
    this.message = this.translate.format('breadcrumb.prepare');
  }

  ngOnInit(): void {
    this.setInboundAddresses();

    if (this.asset) {
      const balances$ = this.userService.userBalances$.subscribe((balances) => {
        this.balance = this.userService.findBalance(balances, this.asset.asset);

        this.chainBalance = this.userService.findBalance(
          balances,
          getChainAsset(this.asset?.asset.chain)
        );
      });

      const user$ = this.userService.user$.subscribe((user) => {
        this.user = user;
      });

      this.client = this.userService.getChainClient(
        this.user,
        this.asset.asset.chain
      );

      this.subs = [balances$, user$];
    }
  }

  setInboundAddresses() {
    this.midgardService.getInboundAddresses().subscribe({
      next: (res) => (this.inboundAddresses = res),
    });
  }

  nextDisabled(): boolean {
    if (!this.user) {
      return true;
    }

    if (!this.asset) {
      return true;
    }

    const client = this.userService.getChainClient(
      this.user,
      this.asset.asset.chain
    );
    if (!client) {
      return true;
    }

    if (!this.inboundAddresses || !this.asset || !this.chainBalance) {
      return true;
    }

    if (
      environment.network !== 'testnet' &&
      this.chainBalance <
      this.txUtilsService.calculateNetworkFee(
        getChainAsset(this.asset.asset.chain),
        this.inboundAddresses,
        'EXTERNAL'
      )
    ) {
      return true;
    }

    return (
      !this.amountSpendable ||
      !client.validateAddress(this.recipientAddress) ||
      this.amount <= 0
    );
  }

  mainButtonText() {
    if (!this.user) {
      return {
        text: this.translate.format('breadcrumb.connect'),
        isError: false,
      };
    }

    if (!this.asset) {
      return {
        text: this.translate.format('breadcrumb.prepare'),
        isError: false,
      };
    }

    if (!this.inboundAddresses || this.chainBalance == undefined) {
      return {
        text: this.translate.format('breadcrumb.loading'),
        isError: false,
      };
    }

    if (!this.client) {
      return {
        text: this.translate.format(
          'breadcrumb.noClient',
          this.asset.asset.chain
        ),
        isError: true,
      };
    }

    if (this.isMaxError) {
      return {
        text: this.translate.format('breadcrumb.inputFee'),
        isError: true,
      };
    }

    if (
      this.amount <= 0 ||
      !this.amount ||
      !this.recipientAddress ||
      (this.recipientAddress && this.recipientAddress.length <= 10)
    ) {
      return {
        text: this.translate.format('breadcrumb.prepare'),
        isError: false,
      };
    }

    if (!this.client.validateAddress(this.recipientAddress)) {
      return {
        text: this.translate.format('breadcrumb.validAddress'),
        isError: true,
      };
    }

    /** Insufficient Chain balance */
    if (
      environment.network !== 'testnet' &&
      this.chainBalance <
      this.txUtilsService.calculateNetworkFee(
        getChainAsset(this.asset.asset.chain),
        this.inboundAddresses,
        'EXTERNAL'
      )
    ) {
      const chainAsset = getChainAsset(this.asset.asset.chain);
      return {
        text: this.translate.format(
          'breadcrumb.insufficient',
          {
            asset: assetString(chainAsset)
          }
        ),
        isError: true,
      };
    }

    if (!this.amountSpendable) {
      return {
        text: this.translate.format('breadcrumb.insufficientBalance'),
        isError: true,
      };
    }

    return { text: this.translate.format('breadcrumb.ready'), isError: false };
  }

  setMaxError(val) {
    this.isMaxError = val;

    setTimeout(() => {
      this.isMaxError = false;
    }, 2000);
  }

  checkSpendable(): void {
    const maximumSpendableBalance = this.userService.maximumSpendableBalance(
      this.asset.asset,
      this.balance,
      this.inboundAddresses,
      'EXTERNAL'
    );
    this.amountSpendable = this.amount <= maximumSpendableBalance;
    this.message =
      this.amount > 0 &&
      this.amountSpendable &&
      this.recipientAddress.length > 12
        ? this.translate.format('breadcurmb.ready')
        : this.translate.format('breadcurmb.prepare');
  }

  async breadcrumbNav(nav) {
    this.address = await this.userService.getAdrressChain(
      this.asset.asset.chain
    );

    if (nav === 'swap') {
      this.analytics.event('wallet_asset_send_prepare', 'breadcrumb_skip');
      this.overlaysService.setViews(MainViewsEnum.Swap, 'Swap');
    } else if (nav === 'wallet') {
      this.analytics.event('wallet_asset_send_prepare', 'breadcrumb_wallet');
      this.overlaysService.setCurrentUserView({
        userView: 'Addresses',
        address: null,
        chain: null,
        asset: null,
      });
    } else if (nav === 'chain') {
      this.analytics.event(
        'wallet_asset_send_prepare',
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
        'wallet_asset_send_prepare',
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

  sendNav() {
    /** Might be complicated analytics see if won't make performance issue */
    let sendAmountUSD = this.amount * this.asset.assetPriceUSD;
    this.analytics.event(
      'wallet_asset_send_prepare',
      'button_send_*WALLET*_*ASSET*_usd_*numerical_usd_value*',
      sendAmountUSD,
      this.asset.asset.chain,
      assetString(this.asset.asset),
      sendAmountUSD.toString()
    );

    this.confirmSend.next({
      amount: this.amount,
      recipientAddress: this.recipientAddress,
      memo: this.memo,
    });
  }

  backNav() {
    this.analytics.event(
      'wallet_asset_send_prepare',
      'button_cancel_*WALLET*_*ASSET*',
      undefined,
      this.asset.asset.chain,
      assetString(this.asset.asset)
    );
    this.back.emit();
  }

  ngOnDestroy() {
    for (const sub of this.subs) {
      sub.unsubscribe();
    }
  }
}
