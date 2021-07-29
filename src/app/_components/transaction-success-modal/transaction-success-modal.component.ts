import {
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { AssetAndBalance } from 'src/app/_classes/asset-and-balance';
import { CopyService } from 'src/app/_services/copy.service';
import BigNumber from 'bignumber.js';
import { UserService } from 'src/app/_services/user.service';
import { Balance } from '@xchainjs/xchain-client';
import { Subscription } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  AnalyticsService,
  assetString,
} from 'src/app/_services/analytics.service';
import { PoolTypeOption } from 'src/app/_const/pool-type-options';
import { MockClientService } from 'src/app/_services/mock-client.service';
import { Asset } from 'src/app/_classes/asset';
import { noticeData } from '../success-notice/success-notice.component';

export type ModalTypes =
  | 'SWAP'
  | 'DEPOSIT'
  | 'WITHDRAW'
  | 'SEND'
  | 'UPGRADE'
  | 'CREATE';
@Component({
  selector: 'app-transaction-success-modal',
  templateUrl: './transaction-success-modal.component.html',
  styleUrls: ['./transaction-success-modal.component.scss'],
})
export class TransactionSuccessModalComponent implements OnInit, OnDestroy {
  @Output() closeDialog: EventEmitter<null>;

  //added by the new reskin
  @Input() modalType: ModalTypes;
  @Input() poolType: PoolTypeOption;
  @Input() asset: Array<AssetAndBalance>;
  @Input() label: Array<string>;
  @Input() amount: Array<number | BigNumber>;
  @Input() balances: Balance[];
  @Input() hashes: noticeData[];
  @Input() recipientAddress: string;
  @Input() percentage: number;
  @Input() isPlus: boolean = false;
  @Input() hasOutbound: boolean = false;
  @Input() hashOutbound: string = '';
  @Input() targetAddress?: string;
  @Input() disabledAsset: Asset;
  @Input() isPending?: boolean;

  subs: Subscription[];
  firstBalance: number;
  secondBalance: number;

  constructor(
    private analyticsService: AnalyticsService,
    private userService: UserService
  ) {
    this.closeDialog = new EventEmitter<null>();
  }

  getEventTags(index: number) {
    let eventWallet;
    if (this.modalType === 'SWAP') {
      eventWallet = [
        {
          event_category: 'swap_success',
          event_label_wallet: 'tag_receive_container_wallet_*ASSET*',
        },
        {
          event_category: 'swap_success',
          event_label_wallet: 'tag_send_container_wallet_*ASSET*',
        },
      ];
    } else if (this.modalType === 'DEPOSIT') {
      eventWallet = [
        {
          event_category: 'pool_deposit_symmetrical_success',
          event_label_wallet:
            'tag_deposited_asset_container_wallet_*POOL_ASSET*',
        },
        {
          event_category: 'pool_deposit_symmetrical_success',
          event_label_wallet: 'tag_deposited_wallet_THOR.RUNE',
        },
      ];
    } else if (this.modalType === 'UPGRADE') {
      eventWallet = [
        {
          event_category: 'upgrade_success',
          event_label_wallet: 'tag_upgrade_container_wallet_*ASSET*',
        },
        {
          event_category: 'upgrade_success',
          event_label_wallet: 'tag_receive_container_wallet_THOR.RUNE',
        },
      ];
    } else if (this.modalType === 'SEND') {
      eventWallet = [
        {
          event_category: 'wallet_asset_send_success',
          event_label_wallet: 'tag_wallet_*ASSET*',
        },
      ];
    } else if (this.modalType === 'WITHDRAW') {
      eventWallet = [
        {
          event_category: 'pool_withdraw_symmetrical_success',
          event_tag_wallet: 'tag_withdrawn_wallet_*POOL_ASSET*',
        },
      ];
    }

    return eventWallet[index];
  }

  ngOnInit(): void {
    if (this.amount[1] && !(this.amount[1] instanceof Number)) {
      this.amount[1] = Number(this.amount[1].toPrecision());
    }
    if (this.balances) {
      this.firstBalance =
        this.userService.findBalance(this.balances, this.asset[0].asset) ?? 0;
      this.secondBalance =
        this.userService.findBalance(this.balances, this.asset[1].asset) ?? 0;
    }
  }

  closeEventTags() {
    if (this.modalType === 'SWAP') {
      this.analyticsService.event('swap_success', 'button_close');
    } else if (this.modalType === 'DEPOSIT') {
      this.analyticsService.event(
        'pool_withdraw_symmetrical_success',
        'button_close'
      );
    } else if (this.modalType === 'SEND') {
      this.analyticsService.event('wallet_asset_send_success', 'button_close');
    } else if (this.modalType === 'WITHDRAW') {
      this.analyticsService.event(
        'pool_withdraw_symmetrical_success',
        'button_close'
      );
    } else if (this.modalType === 'UPGRADE') {
      this.analyticsService.event('upgrade_success', 'button_close');
    } else if (this.modalType === 'CREATE') {
      this.analyticsService.event('pool_create_success', 'button_close');
    }
  }

  close() {
    this.closeEventTags();
    this.closeDialog.emit();
  }

  ngOnDestroy(): void {
    for (const sub of this.subs) {
      sub.unsubscribe();
    }
  }
}
