"use client";

import { Tag } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { notifyDashboardHeaderPopupOpen } from "@/lib/dashboard-header-popup";
import { replaceUrlIfChanged } from "@/lib/dashboard-lifecycle";
import { FILTER_PARAMS } from "@/lib/filter-params";
import { cn } from "@/lib/utils";
import type { Brand } from "@/types/database";

const ALL_BRANDS_ID = "";

function BrandDropdown({
  label,
  value,
  options,
  onSelect,
  disabled,
  statusText,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onSelect: (id: string) => void;
  disabled?: boolean;
  /** Transient status (Loading… / Updating…) overrides the selected brand label. */
  statusText?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const active = options.find((option) => option.id === value) ?? options[0];

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() =>
          setOpen((current) => {
            const next = !current;
            if (next) notifyDashboardHeaderPopupOpen("brand");
            return next;
          })
        }
        disabled={disabled || options.length === 0}
        className={cn(
          "inline-flex min-w-[160px] items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-card-hover disabled:opacity-50"
        )}
      >
        <span className="flex items-center gap-2 truncate">
          <Tag className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate">{statusText ?? active?.label ?? label}</span>
        </span>
      </button>

      {open && options.length > 0 && (
        <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          {options.map((option) => (
            <button
              key={option.id || "all-brands"}
              type="button"
              onClick={() => {
                onSelect(option.id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full px-3 py-2.5 text-left text-sm transition-colors hover:bg-card-hover",
                option.id === active?.id && "bg-primary/10 text-primary"
              )}
            >
              <span className="truncate font-medium">{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function BrandSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const accountId = searchParams.get(FILTER_PARAMS.account);
  const activeBrandId = searchParams.get(FILTER_PARAMS.brand) ?? ALL_BRANDS_ID;
  const currentQuery = searchParams.toString();

  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadBrands() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (accountId) params.set(FILTER_PARAMS.account, accountId);
        const company = searchParams.get(FILTER_PARAMS.company);
        if (company) params.set(FILTER_PARAMS.company, company);

        const response = await fetch(`/api/brands?${params.toString()}`);
        const data = await response.json();
        if (cancelled) return;

        if (response.ok) {
          const raw = (data.brands ?? []) as Brand[];
          // API/DB may return numeric ids; URL searchParams are always strings.
          setBrands(
            raw.map((brand) => ({
              ...brand,
              id: String(brand.id),
            }))
          );
        } else {
          setBrands([]);
        }
      } catch {
        if (!cancelled) setBrands([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadBrands();
    return () => {
      cancelled = true;
    };
  }, [accountId, searchParams]);

  useEffect(() => {
    setApplying(false);
  }, [activeBrandId, accountId]);

  useEffect(() => {
    if (!activeBrandId || loading) return;

    const brandExists = brands.some((brand) => String(brand.id) === String(activeBrandId));
    if (brandExists) return;

    replaceUrlIfChanged(router, pathname, currentQuery, (params) => {
      params.delete(FILTER_PARAMS.brand);
    });
  }, [activeBrandId, brands, currentQuery, loading, pathname, router]);

  function selectBrand(brandId: string) {
    const nextId = brandId ? String(brandId) : ALL_BRANDS_ID;
    if (nextId === activeBrandId) return;
    setApplying(true);
    replaceUrlIfChanged(
      router,
      pathname,
      currentQuery,
      (params) => {
        if (!nextId) {
          params.delete(FILTER_PARAMS.brand);
          return;
        }
        params.set(FILTER_PARAMS.brand, nextId);
      },
      "brand_filter"
    );
  }

  const options = [
    { id: ALL_BRANDS_ID, label: "All Brands" },
    ...brands.map((brand) => ({
      id: String(brand.id),
      label: brand.name || `Brand ${brand.id}`,
    })),
  ];

  return (
    <BrandDropdown
      label="All Brands"
      statusText={loading ? "Loading…" : applying ? "Updating…" : undefined}
      value={activeBrandId}
      options={options}
      onSelect={selectBrand}
      disabled={loading || applying || !accountId}
    />
  );
}
