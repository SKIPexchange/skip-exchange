import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TargetAddressComponent } from './target-address.component';

describe('TargetAddressComponent', () => {
  let component: TargetAddressComponent;
  let fixture: ComponentFixture<TargetAddressComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ TargetAddressComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(TargetAddressComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
