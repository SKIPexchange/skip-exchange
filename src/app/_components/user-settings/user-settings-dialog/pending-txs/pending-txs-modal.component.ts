import {
  Component,
  EventEmitter,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { Subscription } from 'rxjs';
import {
  TransactionStatusService,
  Tx,
  TxActions,
  TxStatus,
} from 'src/app/_services/transaction-status.service';
import {
  OverlaysService,
  MainViewsEnum,
} from 'src/app/_services/overlays.service';
import { Asset } from 'src/app/_classes/asset';
import { User } from 'src/app/_classes/user';
import { UserService } from 'src/app/_services/user.service';
import { MidgardService } from 'src/app/_services/midgard.service';
import { TransactionDTO } from 'src/app/_classes/transaction';
import { Chain } from '@xchainjs/xchain-util';
import {
  AnalyticsService,
  assetString,
} from 'src/app/_services/analytics.service';
import { LayoutObserverService } from 'src/app/_services/layout-observer.service';
import { MockClientService } from 'src/app/_services/mock-client.service';
import { TranslateService } from 'src/app/_services/translate.service';

@Component({
  selector: 'app-pending-txs-modal',
  templateUrl: './pending-txs-modal.component.html',
  styleUrls: ['./pending-txs-modal.component.scss'],
})
export class PendingTxsModalComponent implements OnInit, OnDestroy {
  txs: Tx[];
  subs: Subscription[];
  bitcoinExplorerUrl: string;
  bchExplorerUrl: string;
  binanceExplorerUrl: string;
  thorchainExplorerUrl: string;
  ethereumExplorerUrl: string;
  litecoinExplorerUrl: string;
  @Output() back: EventEmitter<null>;
  user: User;
  transactions: TransactionDTO;
  activeIndex: number;
  loading: boolean;
  isMobile: boolean = false;
  itemsInView: number = 6;

  constructor(
    private txStatusService: TransactionStatusService,
    private overlaysService: OverlaysService,
    private userService: UserService,
    private midgardService: MidgardService,
    private analytics: AnalyticsService,
    private layout: LayoutObserverService,
    private mockClientService: MockClientService,
    public translate: TranslateService
  ) {
    this.back = new EventEmitter<null>();
    this.txs = [];

    const pendingTxs$ = this.txStatusService.txs$.subscribe((txs) => {
      this.txs = txs;
    });

    const user$ = this.userService.user$.subscribe(async (user) => {
      this.user = user;
    });

    const layout$ = this.layout.isMobile.subscribe((res) => {
      this.isMobile = res;
    });

    this.subs = [pendingTxs$, user$, layout$];
  }

  ngOnInit(): void {
    this.getThorchainTxs(this.user.wallet);

    let container = document.querySelector('.long-content');
    this.itemsInView = Math.floor((container.clientHeight - 20) / 49);
    console.log(this.itemsInView);
  }

  getStatus(status: string): TxStatus {
    switch (status) {
      case 'success':
        return TxStatus.COMPLETE;
      case 'refunded':
        return TxStatus.REFUNDED;
      default:
        return TxStatus.PENDING;
    }
  }

  getAction(action: string): TxActions {
    switch (action) {
      case 'swap':
        return TxActions.SWAP;
      case 'withdraw':
        return TxActions.WITHDRAW;
      case 'addLiquidity':
        return TxActions.DEPOSIT;
      case 'switch':
        return TxActions.UPGRADE_RUNE;
      case 'refund':
        return TxActions.REFUND;
      default:
        TxActions.SWAP;
    }
  }

  activeitem(index: number) {
    this.activeIndex = index;
  }

  // TODO: need check all the deposit txs for asyms
  // ALSO, need a great cleanup (see example when the tx is pending)
  transactionToTx(transactions: TransactionDTO): Tx[] {
    let txs: Tx[] = [];

    transactions.actions.forEach((transaction) => {
      let inboundAsset;
      let outbound = undefined;
      let status = this.getStatus(transaction.status);
      let action = this.getAction(transaction.type);
      let date = new Date(+transaction.date / 1000000);

      if (transaction.out.length > 0 && transaction.type == 'swap') {
        inboundAsset = new Asset(transaction?.in[0]?.coins[0]?.asset);
        const outboundAsset = new Asset(transaction?.out[0]?.coins[0]?.asset);

        outbound = {
          hash: transaction?.out[0]?.txID,
          asset: outboundAsset,
        };
      }

      if (transaction.type == 'addLiquidity') {
        inboundAsset = new Asset(transaction?.in[0]?.coins[0]?.asset);
        const outboundAsset = new Asset(transaction.pools[0]);

        outbound = {
          hash: transaction?.in[1]?.txID,
          asset: outboundAsset,
        };
      }

      if (
        (transaction.type == 'addLiquidity' || transaction.type == 'swap') &&
        transaction.status == 'pending'
      ) {
        inboundAsset = new Asset(transaction?.in[0]?.coins[0]?.asset);
        this.txStatusService.getOutboundHash(transaction.in[0].txID);
      }

      if (transaction.type == 'withdraw') {
        inboundAsset = new Asset(transaction.pools[0]);
      }

      if (transaction.type == 'refund') {
        inboundAsset = new Asset(transaction?.in[0]?.coins[0]?.asset);
      }

      // ignore upgarde txs because of midgard bug (temp)
      if (action == TxActions.UPGRADE_RUNE) {
        return;
      }

      txs.push({
        chain: inboundAsset?.chain,
        hash: transaction.in[0].txID,
        ticker: inboundAsset?.ticker,
        status,
        action,
        date,
        isThorchainTx: true,
        symbol: inboundAsset.symbol,
        outbound,
      });
    });

    return txs;
  }

  async getThorchainTxs(address: string) {
    this.loading = true;

    if (!this.user && !this.user.clients && !this.user.clients.thorchain)
      return;

    // this.transactions = await this.user.clients.thorchain.getTransactions({
    //   address: this.user.clients.thorchain.getAddress(),
    //   limit: 10,
    // })

    this.transactions = await this.midgardService
      .getAddrTransactions(address)
      .toPromise();

    this.transactionToTx(this.transactions).forEach((tx) => {
      if (
        this.txs.find((ptx) => ptx.hash.toUpperCase() === tx.hash.toUpperCase())
      ) {
        return;
      }
      this.txStatusService.addHistoryTransaction(tx);
    });

    this.loading = false;
    // this.txs = this.txs.filter((thing, index) => {
    //   const _thing = JSON.stringify(thing);
    //   return index === this.txs.findIndex(obj => {
    //     return JSON.stringify(obj) === _thing;
    //   });
    // });
  }

  getIconPath(tx: Tx) {
    const asset = new Asset(`${tx.chain}.${tx.symbol}`);
    return asset.iconPath;
  }

  explorerPathAlt(hash: string, chain: Chain, externalTx?: boolean): string {
    if (externalTx) chain = Chain.THORChain;
    hash = chain === Chain.Ethereum ? '0x' + hash : hash;
    return this.mockClientService.getTxByChain(hash, chain);
  }

  exploreEvent(tx: Tx, exploreAsset: string = `${tx.chain}.${tx.ticker}`) {
    if (!exploreAsset) return;

    if (tx.action === 'Withdraw') {
      this.analytics.event(
        'transaction_select',
        `option_selected_withdraw_*POOL_ASSET*_tag_txid_explore_*ASSET*`,
        undefined,
        `${tx.chain}.${tx.ticker}`,
        exploreAsset
      );
    } else if (tx.action === 'Deposit') {
      this.analytics.event(
        'transaction_select',
        'option_selected_deposit_*POOL_ASSET*_tag_txid_explore_*ASSET*',
        undefined,
        `${tx.chain}.${tx.ticker}`,
        exploreAsset
      );
    } else if (tx.action === 'Swap') {
      this.analytics.event(
        'transaction_select',
        'option_selected_swap_*FROM_ASSET*_*TO_ASSET*_tag_txid_explore_*ASSET*',
        undefined,
        `${tx.chain}.${tx.ticker}`,
        assetString(tx.outbound.asset),
        exploreAsset
      );
    } else if (tx.action === 'Upgrade') {
      this.analytics.event(
        'transaction_select',
        'option_selected_upgrade_tag_txid_explore_*ASSET*',
        undefined,
        exploreAsset
      );
    } else if (tx.action === 'Send') {
      this.analytics.event(
        'transaction_select',
        'option_selected_send_tag_txid_explore_*ASSET*',
        undefined,
        exploreAsset
      );
    } else if (tx.action === 'Refund') {
      this.analytics.event(
        'transaction_select',
        'option_selected_refund_tag_txid_explore_*ASSET*',
        undefined,
        exploreAsset
      );
    }
  }

  breadcrumbNav(val: string) {
    if (val === 'swap') {
      this.analytics.event('transaction_select', 'breadcrumb_skip');
      this.overlaysService.setViews(MainViewsEnum.Swap, 'Swap');
    }
  }

  close(): void {
    this.analytics.event('transaction_select', 'button_close');
    this.overlaysService.setViews(MainViewsEnum.Swap, 'Swap');
  }

  ngOnDestroy() {
    for (const sub of this.subs) {
      sub.unsubscribe();
    }
  }
}
