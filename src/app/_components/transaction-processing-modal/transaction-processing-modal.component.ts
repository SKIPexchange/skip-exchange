import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Asset } from 'src/app/_classes/asset';
import { AssetAndBalance } from 'src/app/_classes/asset-and-balance';
import { PoolTypeOption } from 'src/app/_const/pool-type-options';
import { TranslateService } from 'src/app/_services/translate.service';

type ProcessingType =
  | 'Swap'
  | 'Deposit'
  | 'Withdraw'
  | 'Create Pool'
  | 'Send'
  | 'Upgrade';

@Component({
  selector: 'app-transaction-processing-modal',
  templateUrl: './transaction-processing-modal.component.html',
  styleUrls: ['./transaction-processing-modal.component.scss'],
})
export class TransactionProcessingModalComponent {
  @Input() transactionDetail: string;
  @Output() closeDialog: EventEmitter<null>;
  @Input() isSending: boolean = false;
  @Input() isWithdraw: boolean = false;
  @Input() asset: Array<AssetAndBalance>;
  @Input() label: Array<string>;
  @Input() amount: Array<number>;
  @Input() recipientAddress: string;
  @Input() percentage: number;
  @Input() isPlus: boolean = false;
  @Input() memo: string;
  @Input() targetAddress?: string;
  @Input() disabledAsset: Asset;
  @Input() type: ProcessingType;
  @Input() poolType: PoolTypeOption;

  constructor(public transalte: TranslateService) {
    this.closeDialog = new EventEmitter<null>();
  }

  onCloseDialog() {
    this.closeDialog.emit();
  }
}
