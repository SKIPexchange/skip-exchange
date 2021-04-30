import { Component, Inject, Input, OnDestroy, OnInit, Output, EventEmitter } from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import { User } from '../../_classes/user';
import { TransactionConfirmationState } from '../../_const/transaction-confirmation-state';
import { UserService } from '../../_services/user.service';
import { environment } from 'src/environments/environment';
import { assetAmount, assetToBase, assetToString } from '@xchainjs/xchain-util';
import { TransactionStatusService, TxActions, TxStatus } from 'src/app/_services/transaction-status.service';
import { Router } from '@angular/router';
import { OverlaysService } from 'src/app/_services/overlays.service';
import { EthUtilsService } from 'src/app/_services/eth-utils.service';
import { Asset } from 'src/app/_classes/asset';

// TODO: this is the same as ConfirmStakeData in confirm stake modal
export interface ConfirmWithdrawData {
  asset;
  rune;
  assetAmount: number;
  runeAmount: number;
  user: User;
  runeBasePrice: number;
  assetBasePrice: number;
  unstakePercent: number;
  assetPrice: number;
  runePrice: number;
  runeFee: number;
  networkFee: number;
}

@Component({
  selector: 'app-confirm-withdraw-modal',
  templateUrl: './confirm-withdraw-modal.component.html',
  styleUrls: ['./confirm-withdraw-modal.component.scss']
})
export class ConfirmWithdrawModalComponent implements OnInit, OnDestroy {

  runeSymbol = environment.network === 'chaosnet' ? 'RUNE-B1A' : 'RUNE-67C';
  txState: TransactionConfirmationState;
  hash: string;
  subs: Subscription[];
  killPolling: Subject<void> = new Subject();
  error: string;
  estimatedMinutes: number;
  rune = new Asset('THOR.RUNE');

  //new reskin data injection
  @Input() data: ConfirmWithdrawData;
  @Output() close: EventEmitter<boolean>;

  constructor(
    private txStatusService: TransactionStatusService,
    private userService: UserService,
    private router: Router,
    private overlaysService: OverlaysService,
    private ethUtilsService: EthUtilsService,
  ) {
    this.close = new EventEmitter<boolean>();
    this.txState = TransactionConfirmationState.PENDING_CONFIRMATION;
    const user$ = this.userService.user$.subscribe(
      (user) => {
        if (!user) {
          this.closeDialog();
        }
      }
    );

    this.subs = [user$];
  }

  ngOnInit(): void {
    this.estimateTime();
  }

  async estimateTime() {
    if (this.data.asset.chain === 'ETH' && this.data.asset.symbol !== 'ETH') {
      this.estimatedMinutes = await this.ethUtilsService.estimateERC20Time(assetToString(this.data.asset), this.data.assetAmount);
    } else {
      this.estimatedMinutes = this.txStatusService.estimateTime(this.data.asset.chain, this.data.assetAmount);
    }
  }

  async submitTransaction(): Promise<void> {
    this.txState = TransactionConfirmationState.SUBMITTING;

    const thorClient = this.data.user.clients.thorchain;
    if (!thorClient) {
      console.error('no thor client found!');
      return;
    }

    const txCost = assetToBase(assetAmount(0.00000001));

    const memo = `WITHDRAW:${this.data.asset.chain}.${this.data.asset.symbol}:${this.data.unstakePercent * 100}`;

    // withdraw RUNE
    try {
      const hash = await thorClient.deposit({
        amount: txCost,
        memo,
      });

      this.txSuccess(hash);
    } catch (error) {
      console.error('error making RUNE withdraw: ', error);
      this.error = error;
      this.txState = TransactionConfirmationState.ERROR;
    }

  }

  goToNav(nav: string) {
    if (nav === 'pool') {
      this.router.navigate(['/', 'pool']);
    }
    else if (nav === 'swap') {
      this.router.navigate(['/', 'swap']);
    }
  }

  txSuccess(hash: string) {
    this.txState = TransactionConfirmationState.SUCCESS;
    this.hash = hash;
    this.txStatusService.addTransaction({
      chain: 'THOR',
      hash: this.hash,
      ticker: `${this.data.asset.ticker}-RUNE`,
      symbol: this.data.asset.symbol,
      status: TxStatus.PENDING,
      action: TxActions.WITHDRAW,
      isThorchainTx: true
    });
  }

  closeDialog(transactionSucess?: boolean) {
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
