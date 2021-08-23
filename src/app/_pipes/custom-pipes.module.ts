import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ShortNumberPipe } from './short-number.pipe';
import { BalanceNumberPipe } from './balance-number.pipe';

@NgModule({
  declarations: [ShortNumberPipe, BalanceNumberPipe],
  imports: [CommonModule],
  exports: [ShortNumberPipe, BalanceNumberPipe],
})
export class CustomPipesModule {}
