import {
  Component,
  Input,
  OnInit,
  Output,
  ViewChild,
  EventEmitter,
  AfterViewInit,
} from '@angular/core';
import { Network } from '@xchainjs/xchain-client';
import { LayoutObserverService } from 'src/app/_services/layout-observer.service';
import {
  OverlaysService,
  MainViewsEnum,
  SwapViews,
} from 'src/app/_services/overlays.service';
import { environment } from 'src/environments/environment';

export type Path = {
  name: string;
  disable?: boolean;
  mainView?: string;
  swapView?: SwapViews;
  backFunc?: boolean;
  call?: string;
};

@Component({
  selector: 'app-breadcrumb',
  templateUrl: './breadcrumb.component.html',
  styleUrls: ['./breadcrumb.component.scss'],
})
export class BreadcrumbComponent implements OnInit, AfterViewInit {
  @ViewChild('cursor') cursor;
  @Input() path: Array<Object> = [
    { name: 'TEXT', mainView: 'Swap', swapView: 'Swap', disable: false },
  ];
  _message;
  @Input() get message() {
    return this._message;
  }
  set message(data) {
    if (!this._message) {
      this._message = data;
    }
    if (typeof data === 'string' && data !== this._message) {
      this._message = data;
      this.scrollLeft();
    } else if (
      typeof data !== 'string' &&
      (data.text !== this._message.text ||
        data.isError !== this._message.isError)
    ) {
      this._message = data;
      this.scrollLeft();
    }
  }
  @Input() isError;
  @Input() backName?: string = null;
  @Output() backFunc: EventEmitter<null>;
  @Output() funcCaller: EventEmitter<string>;
  isMobile: boolean = false;
  isTestnet: boolean;

  constructor(
    private overlaysService: OverlaysService,
    private layout: LayoutObserverService
  ) {
    this.backFunc = new EventEmitter<null>();
    this.funcCaller = new EventEmitter<string>();

    this.isTestnet = environment.network === Network.Testnet;
    this.layout.isMobile.subscribe((res) => (this.isMobile = res));
  }

  ngOnInit(): void {}

  ngAfterViewInit() {
    this.scrollLeft();
  }

  scrollLeft() {
    let scrolls = document.getElementsByClassName('scroll');
    Array.prototype.forEach.call(scrolls, (scroll) => {
      scroll.scrollLeft = scroll.scrollWidth;
    });
  }

  changePath(path: Path) {
    if (path.mainView == 'Swap')
      this.overlaysService.setViews(MainViewsEnum.Swap, path.swapView);
    else if (path.mainView == 'Reconnect')
      this.overlaysService.setCurrentView(MainViewsEnum.Reconnect);
    else if (path.mainView == 'User Setting')
      this.overlaysService.setCurrentView(MainViewsEnum.UserSetting);
  }

  navHandler(path: Path) {
    if (!path.disable) {
      path.backFunc
        ? this.backFunc.emit()
        : path.call
        ? this.funcCaller.emit(path.call)
        : this.changePath(path);
    }
  }
}
