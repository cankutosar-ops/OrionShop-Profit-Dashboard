"use client";



import { Tag } from "lucide-react";

import type { NetSalesStatus } from "@/lib/sales-revenue-resolution";

import { isNetSalesReady } from "@/lib/sales-revenue-resolution";

import { TEMPORARILY_UNAVAILABLE } from "@/lib/user-facing-errors";

import { cn, formatCurrency } from "@/lib/utils";



type NetSalesMetricCardProps = {

  grossSales: number;

  returnedSales: number;

  netSales: number;

  netSalesStatus: NetSalesStatus;

  isEmptyPeriod?: boolean;

};



export function NetSalesMetricCard({

  grossSales,

  returnedSales,

  netSales,

  netSalesStatus,

  isEmptyPeriod = false,

}: NetSalesMetricCardProps) {

  const revenueReady = isNetSalesReady(netSalesStatus);

  const isUnavailable = netSalesStatus === "unavailable";



  const formatMoney = (value: number) => (isEmptyPeriod ? "—" : formatCurrency(value));



  const primaryValue = isEmptyPeriod

    ? "—"

    : isUnavailable

      ? TEMPORARILY_UNAVAILABLE

      : formatCurrency(netSales);



  return (

    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all hover:border-primary/30 hover:bg-card-hover">

      <div className="flex items-start justify-between">

        <div className="space-y-2">

          <p className="text-sm font-medium text-muted-foreground">Net Sales (priceWithDisc)</p>

          <p

            className={cn(

              "font-bold tracking-tight",

              isUnavailable ? "text-base" : "text-2xl"

            )}

          >

            {primaryValue}

          </p>

          {!isEmptyPeriod && revenueReady && (

            <div className="space-y-0.5 text-xs text-muted-foreground">

              <p>Gross Sales {formatMoney(grossSales)}</p>

              <p>Returned Sales {formatMoney(returnedSales)}</p>

              <p className="font-medium text-muted-foreground/90">Net Sales {formatMoney(netSales)}</p>

            </div>

          )}

          {!isEmptyPeriod && isUnavailable && (

            <p className="text-xs text-muted-foreground">Revenue data is being synchronized</p>

          )}

        </div>

        <div

          className={cn(

            "flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br",

            "from-primary/20 to-primary/5 text-primary"

          )}

        >

          <Tag className="h-5 w-5" />

        </div>

      </div>

    </div>

  );

}

