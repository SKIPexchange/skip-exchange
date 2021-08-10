import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SuccessNoticeComponent } from './success-notice.component';

describe('SuccessNoticeComponent', () => {
  let component: SuccessNoticeComponent;
  let fixture: ComponentFixture<SuccessNoticeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [SuccessNoticeComponent],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(SuccessNoticeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
