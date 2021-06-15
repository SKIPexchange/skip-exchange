import {
  Component,
  Inject,
  Input,
  OnDestroy,
  OnInit,
  Output,
  EventEmitter,
} from "@angular/core";
import { Subject, Subscription } from "rxjs";
import { User } from "../../_classes/user";
import { TransactionConfirmationState } from "../../_const/transaction-confirmation-state";
import { UserService } from "../../_services/user.service";
import { assetAmount, assetToBase, assetToString } from "@xchainjs/xchain-util";
import {
  TransactionStatusService,
  TxActions,
  TxStatus,
} from "src/app/_services/transaction-status.service";
import { Router } from "@angular/router";
import { OverlaysService } from "src/app/_services/overlays.service";
import { EthUtilsService } from "src/app/_services/eth-utils.service";
import { Asset } from "src/app/_classes/asset";
import { WithdrawTypeOptions } from "src/app/_const/withdraw-type-options";
import { TransactionUtilsService } from "src/app/_services/transaction-utils.service";
import { MidgardService } from "src/app/_services/midgard.service";
import { AnalyticsService, assetString } from "src/app/_services/analytics.service";

// TODO: this is the same as ConfirmStakeData in confirm stake modal
export interface ConfirmWithdrawData {
  asset;
  rune;
  runeBasePrice: number;
  assetBasePrice: number;
  assetAmount: number;
  runeAmount: number;
  user: User;
  unstakePercent: number;
  assetPrice: number;
  runePrice: number;
  runeFee: number;
  networkFee: number;
  withdrawType: WithdrawTypeOptions;
}

@Component({
  selector: "app-confirm-withdraw-modal",
  templateUrl: "./confirm-withdraw-modal.component.html",
  styleUrls: ["./confirm-withdraw-modal.component.scss"],
})
export class ConfirmWithdrawModalComponent implements OnInit, OnDestroy {
  txState: TransactionConfirmationState;
  hash: string;
  subs: Subscription[];
  killPolling: Subject<void> = new Subject();
  error: string;
  estimatedMinutes: number;
  rune = new Asset("THOR.RUNE");

  //new reskin data injection
  @Input() data: ConfirmWithdrawData;
  @Output() close: EventEmitter<boolean>;

  message: string = "confirm";

  constructor(
    private txStatusService: TransactionStatusService,
    private txUtilsService: TransactionUtilsService,
    private userService: UserService,
    private router: Router,
    private overlaysService: OverlaysService,
    private ethUtilsService: EthUtilsService,
    private midgardService: MidgardService,
    private analytics: AnalyticsService
  ) {
    this.close = new EventEmitter<boolean>();
    this.txState = TransactionConfirmationState.PENDING_CONFIRMATION;
    const user$ = this.userService.user$.subscribe((user) => {
      if (!user) {
        this.closeDialog();
      }
    });

    this.subs = [user$];
  }

  ngOnInit(): void {
    this.estimateTime();
  }

  async estimateTime() {
    if (this.data.asset.chain === "ETH" && this.data.asset.symbol !== "ETH") {
      this.estimatedMinutes = await this.ethUtilsService.estimateERC20Time(
        assetToString(this.data.asset),
        this.data.assetAmount
      );
    } else {
      this.estimatedMinutes = this.txStatusService.estimateTime(
        this.data.asset.chain,
        this.data.assetAmount
      );
    }
  }

  async submitTransaction(): Promise<void> {
    this.txState = TransactionConfirmationState.SUBMITTING;
    
    let withdrawAmountUSD = this.data.runeAmount * this.data.runePrice + this.data.assetAmount * this.data.assetPrice;
    this.analytics.event('pool_withdraw_symmetrical_confirm', 'button_withdraw_confirm_*POOL_ASSET*_usd_*numerical_usd_value*', withdrawAmountUSD, assetString(this.data.asset), withdrawAmountUSD.toString())

    const memo = `WITHDRAW:${this.data.asset.chain}.${this.data.asset.symbol}:${
      this.data.unstakePercent * 100
    }`;

    if (this.data.withdrawType === "ASYM_ASSET") {
      this.assetWithdraw(memo);
    } else {
      this.runeWithdraw(memo);
    }
  }

  async runeWithdraw(memo: string) {
    this.analytics.eventEmitter('withdraw', 'withdraw_page', assetToString(this.data.asset), this.data.assetAmount * this.data.assetPrice + this.data.runeAmount * this.data.runePrice) 

    // withdraw RUNE
    try {
      const txCost = assetToBase(assetAmount(0.00000001));

      const thorClient = this.data.user.clients.thorchain;
      if (!thorClient) {
        console.error("no thor client found!");
        return;
      }

      const hash = await thorClient.deposit({
        amount: txCost,
        memo,
      });

      this.txSuccess(hash);
    } catch (error) {
      console.error("error making RUNE withdraw: ", error);
      this.error = error;
      this.message = error;
      this.txState = TransactionConfirmationState.ERROR;
    }
  }

  async assetWithdraw(memo: string) {
    try {
      const asset = this.data.asset;

      const inboundAddresses = await this.midgardService
        .getInboundAddresses()
        .toPromise();
      if (!inboundAddresses) {
        console.error("no inbound addresses found");
        this.error = "No Inbound Addresses Found. Please try again later.";
        this.txState = TransactionConfirmationState.ERROR;
        return;
      }

      const matchingInboundAddress = inboundAddresses.find(
        (inbound) => inbound.chain === asset.chain
      );
      if (!matchingInboundAddress) {
        console.error("no matching inbound addresses found");
        this.error =
          "No Matching Inbound Address Found. Please try again later.";
        this.txState = TransactionConfirmationState.ERROR;
        return;
      }

      const minAmount = this.txUtilsService.getMinAmountByChain(asset.chain);
      let hash = "";
      switch (asset.chain) {
        case "ETH":
          const ethClient = this.data.user.clients.ethereum;
          if (!ethClient) {
            console.error("no ETH client found for withdraw");
            this.error = "No Eth Client Found. Please try again later.";
            this.txState = TransactionConfirmationState.ERROR;
            return;
          }
          const ethHash = await this.ethUtilsService.callDeposit({
            inboundAddress: matchingInboundAddress,
            ethClient,
            asset: new Asset("ETH.ETH"),
            amount: minAmount.amount(),
            memo,
          });

          hash = this.ethUtilsService.strip0x(ethHash);

          break;

        case "BTC":
        case "BCH":
        case "LTC":
        case "BNB":
          const client = this.userService.getChainClient(
            this.data.user,
            asset.chain
          );
          if (!client) {
            console.error("no client found for withdraw");
            this.error = "No Client Found. Please try again later.";
            this.txState = TransactionConfirmationState.ERROR;
            return;
          }

          hash = await client.transfer({
            asset: {
              chain: asset.chain,
              symbol: asset.symbol,
              ticker: asset.ticker,
            },
            amount: minAmount,
            recipient: matchingInboundAddress.address,
            memo,
            feeRate: +matchingInboundAddress.gas_rate,
          });
          break;
      }

      if (hash.length > 0) {
        this.txSuccess(hash);
      } else {
        console.error("hash empty");
        this.error = "Error withdrawing, hash is empty. Please try again later";
        this.txState = TransactionConfirmationState.ERROR;
      }
    } catch (error) {
      console.error(error);
      this.error = "Error withdrawing. Please try again later";
      this.txState = TransactionConfirmationState.ERROR;
    }
  }

  breadcrumbNav(nav: string, mode: 'pending' | 'processing' | 'success') {
    if (nav === "pool") {
      this.router.navigate(["/", "pool"]);
      if (mode === 'pending') {
        this.analytics.event('pool_withdraw_symmetrical_confirm', 'breadcrumb_pools');
      }
      else if (mode === 'processing') {
        this.analytics.event('pool_withdraw_symmetrical_processing', 'breadcrumb_pools');
      }
      else if ( mode === 'success') {
        this.analytics.event('pool_withdraw_symmetrical_success', 'breadcrumb_pools');
      }
    } else if (nav === "swap") {
      this.router.navigate(["/", "swap"]);
      if (mode === 'pending') {
        this.analytics.event('pool_withdraw_symmetrical_confirm', 'breadcrumb_skip');
      }
      else if (mode === 'processing') {
        this.analytics.event('pool_withdraw_symmetrical_processing', 'breadcrumb_skip');
      }
      else if ( mode === 'success') {
        this.analytics.event('pool_withdraw_symmetrical_success', 'breadcrumb_skip');
      }
    }
  }

  txSuccess(hash: string) {
    this.txState = TransactionConfirmationState.SUCCESS;
    this.hash = hash;
    this.txStatusService.addTransaction({
      chain: "THOR",
      hash: this.hash,
      ticker: `${this.data.asset.ticker}-RUNE`,
      symbol: this.data.asset.symbol,
      status: TxStatus.PENDING,
      action: TxActions.WITHDRAW,
      isThorchainTx: true,
    });

    this.analytics.event('pool_withdraw_symmetrical_success', 'tag_withdrawn_asset_container_wallet_*POOL_ASSET*', undefined, assetString(this.data.asset));
    this.analytics.event('pool_withdraw_symmetrical_success', 'tag_withdrawn_wallet_THOR.RUNE')
  }

  closeDialog(transactionSucess?: boolean) {
    let withdrawAmountUSD = this.data.runeAmount * this.data.runePrice + this.data.assetAmount * this.data.assetPrice;
    this.analytics.event('pool_withdraw_symmetrical_confirm', 'button_withdraw_cancel_*POOL_ASSET*_usd_*numerical_usd_value*', withdrawAmountUSD, assetString(this.data.asset), withdrawAmountUSD.toString())

    this.close.emit(transactionSucess);
  }

  closeToPool() {
    this.router.navigate(["/", "pool"]);
  }

  ngOnDestroy() {
    for (const sub of this.subs) {
      sub.unsubscribe();
    }
  }
}
