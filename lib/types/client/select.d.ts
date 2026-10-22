import * as React from 'react';
/** Menu appearance and fixed-position behavior follow dsh-free-search / dsh-proxy. */
export declare const selectCss = "\n.dshcu-select{box-sizing:border-box;width:100%;height:36px;padding:0 12px;display:flex;align-items:center;gap:8px;text-align:left;border:1px solid var(--dsw-alias-border-l4,rgba(127,127,127,.3));border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-3,transparent);color:inherit;font:inherit;font-size:13px;cursor:pointer}\n.dshcu-select:hover{border-color:var(--dsw-alias-border-l3,#888)}\n.dshcu-select:focus-visible,.dshcu-select[aria-expanded=true]{outline:2px solid var(--cl-accent,#D97757);outline-offset:2px}\n.dshcu-select:disabled{opacity:.5;cursor:default}\n.dshcu-menu{position:fixed;z-index:1100;box-sizing:border-box;padding:4px;overflow-y:auto;overscroll-behavior:contain;border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-menu-surface-fill,var(--dsw-alias-bg-layer-1,#fff));color:var(--dsw-alias-label-primary,#222);backdrop-filter:var(--dsw-menu-backdrop-filter,none);box-shadow:var(--dsw-elevation-prominent,0 10px 32px rgba(0,0,0,.16),0 0 0 .5px rgba(0,0,0,.1))}\n.dshcu-option{display:flex;align-items:center;gap:8px;min-height:34px;padding:6px 8px;box-sizing:border-box;border-radius:var(--dsw-radius-md,8px);font-size:13px;line-height:20px;cursor:pointer;user-select:none}\n.dshcu-option[data-active=true]{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}\n";
export declare function Select<V extends string>({ options, value, disabled, label, onChange }: {
    options: {
        value: V;
        label: string;
    }[];
    value: V;
    disabled?: boolean;
    label: string;
    onChange(value: V): void;
}): React.DetailedReactHTMLElement<{
    style: {
        minWidth: number;
    };
}, HTMLElement>;
