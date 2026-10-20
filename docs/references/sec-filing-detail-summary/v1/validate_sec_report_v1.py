"""SEC filing v1 strict schema and high-impact consistency checks.
Usage: python validate_sec_report_v1.py analysis.json
Requires: pip install jsonschema
"""
import json, pathlib, sys
from datetime import datetime
from jsonschema import Draft202012Validator

BASE=pathlib.Path(__file__).resolve().parent
SCHEMA=json.loads((BASE/'sec_filing_schema_v1.json').read_text())
MATERIAL_NULL_PATHS=[
    '/filing/accepted_at_utc', '/filing/sec_primary_document_url', '/filing/accession_number',
]
HIGH_IMPACT_FIELD_PATHS={
 'ATM':('/financing/atm_programs', ['contractual_total_cap','prospectus_total_cap','sold_gross_cumulative','effective_current_remaining_cap','fixed_share_price','share_price_type','registered_remaining_capacity','s3_ib6_remaining_capacity','actual_sales_confirmed']),
 'WARRANT':('/financing/warrants',['current_exercise_price','original_exercise_price','cashless_exercise_allowed','repricing_allowed','repricing_formula','underlying_shares_outstanding','expiry_date']),
 'CONVERTIBLE':('/financing/convertible_instruments',['fixed_conversion_price','conversion_price_type','conversion_floor','remaining_conversion_shares','outstanding_principal']),
 'ELOC':('/financing/equity_lines',['committed_purchase_amount','reference_price_formula','discount_pct','price_floor','drawable_remaining']),
 'SHELF':('/financing/shelf_registrations',['nominal_registration_amount','declared_effective','effective_date','shelf_remaining_amount']),
 'RESALE_REGISTRATION':('/financing/resale_registrations',['resale_registered_shares','already_issued_shares','unissued_warrant_underlying_shares','proceeds_to_issuer_from_resale','effectiveness_date']),
 'PUBLIC_OFFERING':('/financing/primary_offerings',['fixed_price_per_share','share_count','gross_proceeds','net_proceeds','completion_confirmed']),
 'REGISTERED_DIRECT':('/financing/primary_offerings',['fixed_price_per_share','share_count','gross_proceeds','net_proceeds','completion_confirmed']),
 'PRIVATE_PLACEMENT':('/financing/primary_offerings',['fixed_price_per_share','share_count','gross_proceeds','net_proceeds','completion_confirmed']),
 'MATERIAL_CONTRACT':('/business/contracts',['announced_total_value','guaranteed_minimum_value','binding','signed','milestone_conditions']),
 'MA':('/business/acquisitions_mergers',['announced_transaction_value','binding','completed_date','closing_conditions']),
}
CORPORATE_ACTION_REQUIRED=['reverse_split_denominator_before','reverse_split_numerator_after','legal_effective_at_et','reverse_split_post_shares']
LISTING_REQUIRED=['notice_date','rule_violated','cure_deadline','trading_suspension_date','delisting_effective_date']


def non_null_values(node, ptr=''):
    if isinstance(node,dict):
        for k,v in node.items():
            yield from non_null_values(v,ptr+'/'+k.replace('~','~0').replace('/','~1'))
    elif isinstance(node,list):
        for i,v in enumerate(node): yield from non_null_values(v,ptr+'/'+str(i))
    elif node is not None: yield ptr,node

def check(d):
    errors=[]
    for e in Draft202012Validator(SCHEMA).iter_errors(d):
        errors.append('SCHEMA '+('/'.join(map(str,e.absolute_path)) or '/')+' '+e.message)
    if errors:return errors
    ev=d['event']['primary_event_type']
    if d['meta']['processing_status']=='COMPLETE':
        for k in ['filing_index_checked','main_document_checked','all_exhibits_enumerated','material_exhibits_checked']:
            if d['coverage'][k] is not True:errors.append('COVERAGE: '+k+' must be true for COMPLETE')
        if not d['documents']:errors.append('DOCUMENTS: at least one document needed for COMPLETE')
    if d['quality']['final_quality_gate_passed'] is True:
        for k in ['schema_valid','all_material_claims_sourced','all_material_exhibits_reviewed','timestamps_consistent','corporate_actions_adjusted']:
            if d['quality'][k] is not True:errors.append('GATE: '+k+' must be true')
        if d['quality']['contradictory_values_detected'] is True and d['quality']['contradictions_resolved'] is not True:
            errors.append('GATE: unresolved contradictions')
        if d['quality']['missing_critical_fields'] or d['quality']['validation_errors']:
            errors.append('GATE: missing critical fields/validation errors')
    if d['assessment']['trade_eligibility']=='ENTRY_CONDITIONS_MET':
        m=d['market_snapshot'];a=d['assessment']
        if m['quote_is_realtime_confirmed'] is not True or m['last_price'] is None or m['golden_cross_ema9_ema20'] is not True:
            errors.append('TRADING: realtime quote + EMA9/20 golden cross confirmation required')
        if any(a[x] is None for x in ('entry_price','stop_loss_price','take_profit_price')):
            errors.append('TRADING: entry, stop and target required')
        if d['quality']['final_quality_gate_passed'] is not True:
            errors.append('TRADING: quality gate not passed')
    if d['coverage']['outside_market_data_used'] is not True:
        m=d['market_snapshot']
        for f in ['last_price','previous_close','bid','ask','intraday_volume','vwap','rvol','ema9','ema20','golden_cross_ema9_ema20']:
            if m[f] is not None:errors.append('SCOPE: non-SEC market field '+f+' without external source')
    for i,a in enumerate(d['financing']['atm_programs']):
        if a['share_price_type']=='MARKET_VARIABLE' and a['fixed_share_price'] is not None:
            errors.append(f'ATM[{i}]: variable price program cannot claim fixed_share_price')
        if a['effective_current_remaining_cap'] is not None and a['remaining_cap_asof'] is None:
            errors.append(f'ATM[{i}]: current capacity requires dated as-of')
        for f in ['sold_gross_cumulative','contractual_total_cap','effective_current_remaining_cap']:
            if a[f] is not None and a[f]<0:errors.append(f'ATM[{i}]: negative {f}')
    a=d['assessment']
    if d['quality']['final_quality_gate_passed'] is False and a['trade_eligibility']=='ENTRY_CONDITIONS_MET':
        errors.append('TRADING: gated no-entry')
    # Verified numeric results should have source / calculation trace.
    observed={x['json_pointer'] for x in d['evidence'] if x['json_pointer']}
    nulls={x['json_pointer'] for x in d['null_reasons'] if x['json_pointer']}
    critical_paths=set(MATERIAL_NULL_PATHS)
    if ev in HIGH_IMPACT_FIELD_PATHS:
        array_path,fields=HIGH_IMPACT_FIELD_PATHS[ev]
        array_node=d
        for part in array_path.strip('/').split('/'):
            array_node=array_node[part]
        if d['meta']['processing_status']=='COMPLETE' and len(array_node)==0:
            errors.append('COVERAGE: primary event has no corresponding record: '+array_path)
        for i,_ in enumerate(array_node):
            critical_paths.update(f'{array_path}/{i}/{f}' for f in fields)
    if ev=='REVERSE_SPLIT':
        critical_paths.update('/corporate_action/'+f for f in CORPORATE_ACTION_REQUIRED)
    if ev=='LISTING':
        critical_paths.update('/business/listing_compliance/'+f for f in LISTING_REQUIRED)
    # A complete output must account for important values. If value exists, evidence; if null, reason.
    if d['meta']['processing_status']=='COMPLETE':
        for ptr in critical_paths:
            x=d
            try:
                for part in ptr.strip('/').split('/'):
                    x=x[int(part)] if isinstance(x,list) else x[part]
            except (KeyError,IndexError,ValueError):continue
            if x is None and ptr not in nulls:errors.append('MISSING_NULL_REASON '+ptr)
            if x is not None and ptr not in observed:errors.append('MISSING_EVIDENCE '+ptr)
    return errors

if __name__=='__main__':
    if len(sys.argv)!=2:
        raise SystemExit('Usage: python validate_sec_report_v1.py path/to/output.json')
    with open(sys.argv[1],encoding='utf-8') as f: obj=json.load(f)
    result=check(obj)
    if result:
        print('FAILED ('+str(len(result))+')')
        print('\n'.join(result))
        raise SystemExit(1)
    print('VALID')
