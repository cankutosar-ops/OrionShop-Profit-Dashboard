"use client";



import { useProfitModel } from "@/components/dashboard/profit-model-context";

import {

  getProfitModelSwitcherLabel,

  type ProfitModel,

} from "@/lib/profit-model";

import { cn } from "@/lib/utils";



const MODEL_OPTIONS: ProfitModel[] = ["b", "c"];



export function ProfitModelSwitcher() {

  const { model: activeModel, setModel } = useProfitModel();



  function selectModel(model: ProfitModel) {

    if (model === activeModel) return;

    setModel(model);

  }



  return (

    <div

      className="inline-flex rounded-xl border border-border bg-card p-1"

      role="group"

      aria-label="Profit model"

    >

      {MODEL_OPTIONS.map((model) => {

        const isActive = model === activeModel;

        return (

          <button

            key={model}

            type="button"

            onClick={() => selectModel(model)}

            aria-pressed={isActive}

            className={cn(

              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm",

              isActive

                ? "bg-primary text-primary-foreground shadow-sm"

                : "text-muted-foreground hover:bg-card-hover hover:text-foreground"

            )}

          >

            {getProfitModelSwitcherLabel(model)}

          </button>

        );

      })}

    </div>

  );

}

