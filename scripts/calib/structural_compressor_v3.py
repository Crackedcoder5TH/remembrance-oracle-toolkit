import json
import math
import numpy as np
from itertools import combinations
EPS = 1e-12
FIXED_POWER_LAWS = {"kleibers_3/4":0.75,"square_root_1/2":0.50,"linear_1/1":1.00,"square_2/1":2.00,"cube_3/1":3.00,"inv_square_-2/1":-2.00,"inv_1/1":-1.00,"2/3_scaling":0.667,"4/3_scaling":1.333}
FIXED_RECURSIVE_RULES = {"fibonacci":(1.0,1.0),"doubling":(2.0,0.0),"halving":(0.5,0.0)}
def safe_r_squared(actual, predicted):
    actual=np.array(actual,dtype=float); predicted=np.array(predicted,dtype=float)
    var_actual=np.var(actual)
    if var_actual<EPS:
        resid=np.mean((actual-predicted)**2); return 1.0 if resid<EPS else 0.0
    return float(1-np.var(actual-predicted)/var_actual)
def signal_magnitude(values):
    arr=np.array(values,dtype=float); return math.sqrt(np.mean(arr**2)) if len(arr) else 0.0
def residual_magnitude(residuals):
    if not residuals: return 0.0
    return math.sqrt(sum(r**2 for r in residuals)/len(residuals))
def layer_integrity_check(o,r):
    om=signal_magnitude(o); rm=residual_magnitude(r)
    if om<EPS: return False,0.0
    red=1.0-(rm/om); return red>0.05,red
def test_fixed_power_law(values,exponent):
    if len(values)<3: return None
    x=np.arange(1,len(values)+1,dtype=float); y=np.array(values,dtype=float)
    if np.any(y<=0): return None
    template=x**exponent; scale=np.mean(y/template); predicted=scale*template
    return {"residuals":(y-predicted).tolist(),"scale":round(scale,6),"r_squared":round(safe_r_squared(y,predicted),4)}
def test_fixed_recursive(values,a,b):
    if len(values)<4: return None
    v=np.array(values,dtype=float); predicted=[v[0],v[1]]
    for i in range(2,len(v)): predicted.append(a*predicted[-1]+b*predicted[-2])
    predicted=np.array(predicted)
    return {"residuals":(v-predicted).tolist(),"r_squared":round(safe_r_squared(v,predicted),4)}
def test_harmonic(values,cycles=1):
    n=len(values)
    if n<6: return None
    y=np.array(values,dtype=float); x=np.arange(n,dtype=float); T=n/cycles
    A=np.column_stack([np.sin(2*np.pi*x/T),np.cos(2*np.pi*x/T),np.ones(n)])
    coeffs,_,_,_=np.linalg.lstsq(A,y,rcond=None); predicted=A@coeffs
    amp=math.sqrt(coeffs[0]**2+coeffs[1]**2)
    return {"residuals":(y-predicted).tolist(),"amplitude":round(amp,4),"period":round(T,2),"r_squared":round(safe_r_squared(y,predicted),4)}
def detect_single_sequence(values):
    if not values or not all(isinstance(v,(int,float)) for v in values): return {"found":False}
    d=[]
    for law,exp in FIXED_POWER_LAWS.items():
        r=test_fixed_power_law(values,exp)
        if r and r["r_squared"]>0.95:
            ok,red=layer_integrity_check(values,r["residuals"])
            if ok: d.append({"law":law,"type":"power_law","r_squared":r["r_squared"],"signal_reduction":round(red,4)})
    for rule,(a,b) in FIXED_RECURSIVE_RULES.items():
        r=test_fixed_recursive(values,a,b)
        if r and r["r_squared"]>0.95:
            ok,red=layer_integrity_check(values,r["residuals"])
            if ok: d.append({"law":rule,"type":"recursive","r_squared":r["r_squared"],"signal_reduction":round(red,4)})
    for cyc in (1,2,3):
        r=test_harmonic(values,cyc)
        if r and r["r_squared"]>0.95:
            ok,red=layer_integrity_check(values,r["residuals"])
            if ok: d.append({"law":f"harmonic_{cyc}cyc","type":"harmonic","r_squared":r["r_squared"],"signal_reduction":round(red,4)})
    if not d: return {"found":False}
    return {"found":True,"detection":max(d,key=lambda z:z["r_squared"]*z["signal_reduction"])}
def test_relational_power_law(x_vals,y_vals,exponent):
    if len(x_vals)!=len(y_vals) or len(x_vals)<3: return None
    x=np.array(x_vals,dtype=float); y=np.array(y_vals,dtype=float)
    if np.any(x<=0) or np.any(y<=0): return None
    template=x**exponent; scale=np.mean(y/template); predicted=scale*template
    return {"residuals":(y-predicted).tolist(),"scale":round(scale,6),"r_squared":round(safe_r_squared(y,predicted),4)}
def detect_relational(sequences):
    d=[]; names=list(sequences.keys())
    for xn,yn in combinations(names,2):
        xv,yv=sequences[xn],sequences[yn]
        if len(xv)!=len(yv): continue
        for law,exp in FIXED_POWER_LAWS.items():
            for (an,av,bn,bv) in [(xn,xv,yn,yv),(yn,yv,xn,xv)]:
                r=test_relational_power_law(av,bv,exp)
                if r and r["r_squared"]>0.97:
                    ok,red=layer_integrity_check(bv,r["residuals"])
                    if ok: d.append({"law":f"{bn}~{an}^{exp}({law})","r_squared":r["r_squared"],"signal_reduction":round(red,4)})
    if not d: return None
    return max(d,key=lambda z:z["r_squared"]*z["signal_reduction"])
def classify(c):
    if c>=0.85: return "HIGH"
    if c>=0.60: return "MEDIUM"
    if c>=0.30: return "LOW"
    return "NOISE"
patterns={
 "pure_noise":{"values":[0.847,0.231,0.993,0.102,0.774,0.445,0.038,0.912,0.367,0.621,0.189,0.754]},
 "fibonacci":{"values":[1,1,2,3,5,8,13,21,34,55,89,144,233,377,610,987]},
 "kleibers_law":{"mass_kg":[0.02,0.3,3.0,70.0,500.0,4000.0],"metabolic_rate_W":[0.17,1.45,9.7,81.0,386.0,1890.0]},
 "urban_scaling":{"population":[10000,50000,200000,1000000,5000000],"innovation":[12,89,490,3200,21000]},
 "geomagnetic_diurnal":{"delta_nT":[-5,-12,-20,-28,-30,-25,-18,-8,-3,2,5,3,-2,-8,-15,-22,-28,-30,-24,-16,-9,-4,-2,-4]},
 "square_law":{"x":[1,2,3,4,5,6,7,8],"y":[1,4,9,16,25,36,49,64]},
}
def extract(obj,prefix=""):
    s={}
    if isinstance(obj,dict):
        for k,v in obj.items():
            key=f"{prefix}{k}"
            if isinstance(v,list) and v and all(isinstance(x,(int,float)) for x in v): s[key]=v
            elif isinstance(v,(dict,list)): s.update(extract(v,prefix=f"{key}."))
    return s
out={}
for name,pat in patterns.items():
    seqs=extract(pat); best_s=0.0; best_law="none"
    for sn,vals in seqs.items():
        d=detect_single_sequence(vals)
        if d["found"]:
            c=d["detection"]["r_squared"]*d["detection"]["signal_reduction"]
            if c>best_s: best_s=c; best_law=d["detection"]["law"]
    rel=detect_relational(seqs); best_r=0.0; rel_law="none"
    if rel: best_r=min(1.0,rel["r_squared"]*rel["signal_reduction"]); rel_law=rel["law"]
    overall=max(best_s,best_r)
    out[name]={"overall":round(overall,4),"class":classify(overall),"single_law":best_law,"rel_law":rel_law}
print(json.dumps(out,indent=2))
