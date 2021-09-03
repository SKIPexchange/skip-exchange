import {
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { AssetAndBalance } from 'src/app/_classes/asset-and-balance';
import BigNumber from 'bignumber.js';
import { UserService } from 'src/app/_services/user.service';
import { Balance } from '@xchainjs/xchain-client';
import { Subscription } from 'rxjs';
import { AnalyticsService } from 'src/app/_services/analytics.service';
import { Asset } from 'src/app/_classes/asset';
import { noticeData } from '../success-notice/success-notice.component';
import { PoolTypeOption } from 'src/app/_const/pool-type-options';

export type ModalTypes =
  | 'SWAP'
  | 'DEPOSIT'
  | 'WITHDRAW'
  | 'SEND'
  | 'UPGRADE'
  | 'CREATE';

export type SuccessModal = {
  modalType: ModalTypes;
  asset: AssetAndBalance[];
  label: string[];
  amount: (number | BigNumber)[];
  balances?: Balance[]; // only if it is withdraw we can ignore it.
  hashes: noticeData[];
  isPlus?: boolean;
  isPending?: boolean[];
  poolType?: PoolTypeOption;
};
@Component({
  selector: 'app-transaction-success-modal',
  templateUrl: './transaction-success-modal.component.html',
  styleUrls: ['./transaction-success-modal.component.scss'],
})
export class TransactionSuccessModalComponent implements OnInit {
  @Output() closeDialog: EventEmitter<null>;

  //added by the new reskin
  _data: SuccessModal;
  @Input() set data(data: SuccessModal) {
    this._data = data;
    if (data.balances) {
      this.firstBalance =
        // eslint-disable-next-line prettier/prettier
        this.userService.findBalance(data.balances, data.asset[0]?.asset) ?? 0;
      this.secondBalance =
        // eslint-disable-next-line prettier/prettier
        this.userService.findBalance(data.balances, data.asset[1]?.asset) ?? 0;
    }
    // add event tags
    if (data.hashes) {
      const map = this._data.hashes.map((el) => {
        switch (this.data.modalType) {
          case 'WITHDRAW':
            el.tagCategory = 'pool_withdraw_symmetrical_success';
            break;
          case 'SWAP':
            el.tagCategory = 'swap_success';
            break;
          case 'DEPOSIT':
            el.tagCategory = 'pool_deposit_symmetrical_success';
            break;
          case 'SEND':
            el.tagCategory = 'wallet_asset_send_success';
            break;
          case 'UPGRADE':
            el.tagCategory = 'upgrade_success';
            break;
          default:
            break;
        }
      });
    }
  }
  get data() {
    return this._data;
  }
  @Input() recipientAddress?: string;
  @Input() percentage?: number;
  @Input() disabledAsset?: Asset;
  @Input() targetAddress?: string;

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
    if (this.data.modalType === 'SWAP') {
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
    } else if (this.data.modalType === 'DEPOSIT') {
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
    } else if (this.data.modalType === 'UPGRADE') {
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
    } else if (this.data.modalType === 'SEND') {
      eventWallet = [
        {
          event_category: 'wallet_asset_send_success',
          event_label_wallet: 'tag_wallet_*ASSET*',
        },
      ];
    } else if (this.data.modalType === 'WITHDRAW') {
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
    if (this.data.amount[1] && !(this.data.amount[1] instanceof Number)) {
      this.data.amount[1] = Number(this.data.amount[1].toPrecision());
    }
  }

  closeEventTags() {
    if (this.data.modalType === 'SWAP') {
      this.analyticsService.event('swap_success', 'button_close');
    } else if (this.data.modalType === 'DEPOSIT') {
      this.analyticsService.event(
        'pool_withdraw_symmetrical_success',
        'button_close'
      );
    } else if (this.data.modalType === 'SEND') {
      this.analyticsService.event('wallet_asset_send_success', 'button_close');
    } else if (this.data.modalType === 'WITHDRAW') {
      this.analyticsService.event(
        'pool_withdraw_symmetrical_success',
        'button_close'
      );
    } else if (this.data.modalType === 'UPGRADE') {
      this.analyticsService.event('upgrade_success', 'button_close');
    } else if (this.data.modalType === 'CREATE') {
      this.analyticsService.event('pool_create_success', 'button_close');
    }
  }

  close() {
    this.closeEventTags();
    this.closeDialog.emit();
  }
}
