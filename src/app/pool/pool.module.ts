import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PoolComponent } from './pool.component';
import { RouterModule } from '@angular/router';
import { StakedPoolsListComponent } from './staked-pools-list/staked-pools-list.component';
import { StakedPoolListItemComponent } from './staked-pool-list-item/staked-pool-list-item.component';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { IconTickerModule } from '../_components/icon-ticker/icon-ticker.module';
import { BreadcrumbModule } from '../_components/breadcrumb/breadcrumb.module';
import { RightOptionModule } from '../_components/right-option/right-option.module';
import { NoticeModule } from '../_components/notice/notice.module';
import { TagModule } from '../_components/tag/tag.module';
import { PoolListItemComponent } from './pool-list-item/pool-list-item.component';
import { ConnectModule } from '../_components/connect/connect.module';
import { LayoutObserverService } from '../_services/layout-observer.service';
import { CustomPipesModule } from '../_pipes/custom-pipes.module';

@NgModule({
  declarations: [
    PoolComponent,
    StakedPoolsListComponent,
    StakedPoolListItemComponent,
    PoolListItemComponent,
  ],
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    IconTickerModule,
    BreadcrumbModule,
    RightOptionModule,
    NoticeModule,
    TagModule,
    CustomPipesModule,
    ConnectModule,
    RouterModule.forChild([
      {
        path: '',
        component: PoolComponent,
      },
    ]),
  ],
})
export class PoolModule {}
