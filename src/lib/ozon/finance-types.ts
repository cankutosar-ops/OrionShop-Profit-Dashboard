export type OzonExpenseCategory = 'commission' | 'acquiring' | 'logistics' | 'returnsLogistics' | 'storage' |
  'acceptance' | 'advertising' | 'penalties' | 'adjustments' | 'compensation' | 'otherServices' | 'cashMovement' | 'unknown';
export type OzonAccrualType = { id: number; name: string; description: string };

// Explicit vendor machine names from the current Seller API dictionary. No substring heuristics.
const names: Partial<Record<OzonExpenseCategory, readonly string[]>> = {
  commission: ['SaleCommission'], acquiring: ['Acquiring'],
  logistics: ['Shipment','Logistic','LastMile','LastMileCourier','LastMilePickUpPoint','CrossDock','CrossDockPickUpCourierDelivery','Drop-Off','Drop-Off Agent','Pick-Up','PickUpCourierArrangement','PickUpCourierDelivery','Fulfillment','Replenishment','RfbsDomesticDelivery','RfbsGlobalDelivery','QuantProcessingDrop','DeliveryToHandoverPlaceByOzon','InternationalLogisticDelta','OzonGlobalLogisticsDelivery','B2C Drop-Off','B2C Drop-Off Agent','B2CCourierClientReinvoice','B2CDeliveryToHandoverPlaceByOzon','B2CPickUpPointClientReinvoice','B2CLogistics','CourierPickUpByOzon','CourierPickUpReinvoice','MicroFulfillmentPicking'],
  returnsLogistics: ['BackwardShipment','ClientReturn','Cancellation','PartialReturn','PreparingToReturn','ReturnFlowLogistic','PickUpPointReturnAcceptance','RfbsEasyReturn','SellerReturns','B2CPickUpPointReturnAcceptance','B2CBackwardLogistics'],
  storage: ['Placements','ReturnStorageInTheWarehouse','TemporaryPlacement','TemporaryPlacementsAgent','B2CTemporaryPlacement'],
  acceptance: ['SupplyInbound','MicroFulfillmentSupply','PackageUnitProcessing','OversizedExtraHandling','VolumeWeightCharacteristicsProcessing'],
  advertising: ['BrandCommission','BrandPromotion','BrandShelf','ExternalPromotion','InternetSiteAdvertising','LeadGeneration','Marketing','OrdersBooking','PayPerClick','PointsForReviews','PremiumCashbackPromotion','Promotion','PushCampaign','SaleReview','StarsMembership','Stencil','SocialMediaAdvertising','DisplayAdvertisingPlacement','FirstCustomerReview','AcceleratedReviewCollection'],
  penalties: ['DefectRate','DefectFineModeration','DefectFineProhibitedGoods','DefectFineCounterfeitGoods','DefectFineComplaint','DefectFineErrors','DefectFineShipmentDelayRate'],
  adjustments: ['RealizationReportCorrection','AnalyticsCorrection'],
  compensation: ['Compensation','ItemCompensation','B2CInsuranceCompensation','VolumeObligationReward'],
  cashMovement: ['BrandDeposit','SetOff'],
  otherServices: ['Charity','Disposal','EarlyPayment','FlexiblePayments','Installment','ItemCloning','KazakhstanBuyerInstallment','LabelOriginal','Marking','Moderation','OzonData','PackageCost','PackingFee','PremiumMembership','PremiumSubscription','ReviewsPin','RfbsDomesticAgentFee','RfbsGlobalAgentFee','RfbsServiceFee','StockInsurance','ItemPacking','ItemSealing','PackmanCisPacking','VideoCover','ClickAndCollect','CustomerReviews','B2CDisposal','B2CInsuranceShipping','B2CContainerPacking','B2CContainerPackage','IncreaseAssortmentLimit','LabelBrandVerified','RfbsGlobalIntermediaryService','RfbsGlobalPlatformConnectionService','AnalyticsLite','AnalyticsPremium','AnalyticsPlus','AnalyticsPro'],
};
export function classifyOzonAccrual(typeId: unknown, dictionary: OzonAccrualType[]): { category: OzonExpenseCategory; name: string } {
  const type = dictionary.find(row => row.id === typeId);
  if (!type) return { category: 'unknown', name: 'Unknown accrual type' };
  const match = Object.entries(names).find(([, entries]) => entries?.includes(type.name));
  return { category: (match?.[0] as OzonExpenseCategory) ?? 'unknown', name: type.name };
}
