"""
PredictaMaint Diagnostics Module
Provides root-cause failure mode attribution, risk stratification,
and prescriptive maintenance recommendations based on physical machine telemetry.
"""

from typing import Dict, Any, List

def evaluate_diagnostics(
    product_type: str,
    air_temp: float,
    proc_temp: float,
    speed: float,
    torque: float,
    tool_wear: float,
    prob_failure: float,
    pred_binary: int
) -> Dict[str, Any]:
    """
    Evaluates physical sensor parameters against AI4I 2020 domain rules,
    stratifies risk, identifies root-cause failure modes, and issues prescriptive actions.
    """
    temp_diff = proc_temp - air_temp
    power_kw = (torque * speed * (2 * 3.141592653589793 / 60)) / 1000.0
    overstrain = tool_wear * torque

    # Product variant specific overstrain thresholds: L: 11,000, M: 12,000, H: 13,000 min*Nm
    osf_thresholds = {'L': 11000, 'M': 12000, 'H': 13000}
    osf_threshold = osf_thresholds.get(product_type.upper(), 12000)

    # Risk level stratification
    if prob_failure < 0.25:
        risk_level = "LOW (Nominal)"
        risk_badge = "🟢"
    elif prob_failure < 0.50:
        risk_level = "MODERATE (Guarded)"
        risk_badge = "🟡"
    elif prob_failure < 0.75:
        risk_level = "ELEVATED (Warning)"
        risk_badge = "🟠"
    else:
        risk_level = "CRITICAL (Immediate Action)"
        risk_badge = "🔴"

    status = "Failure Likely" if (pred_binary == 1 or prob_failure >= 0.50) else "Normal"

    failure_modes_detected: List[str] = []
    root_causes: List[str] = []
    actions: List[str] = []

    # 1. Tool Wear Failure (TWF): Lifecycle threshold >= 200 min
    if tool_wear >= 200:
        failure_modes_detected.append("Tool Wear Failure (TWF)")
        root_causes.append(f"Tool wear critical ({tool_wear:.0f} min >= 200 min lifecycle threshold)")
        actions.append("Halt spindle; replace cutting tool insert immediately and reset tool wear counter.")
    elif tool_wear >= 160:
        root_causes.append(f"Tool wear elevated ({tool_wear:.0f} min) - approaching replacement window")

    # 2. Heat Dissipation Failure (HDF): Temp diff < 8.6 K and Speed < 1380 rpm
    if temp_diff < 8.6 and speed < 1380:
        failure_modes_detected.append("Heat Dissipation Failure (HDF)")
        root_causes.append(
            f"Thermal dissipation deficit (ΔT = {temp_diff:.1f} K < 8.6 K) coupled with low cooling airflow ({speed:.0f} rpm < 1380 rpm)"
        )
        actions.append("Inspect and flush coolant channels, clean radiator fins, and ensure environmental ventilation.")
    elif temp_diff < 8.6:
        root_causes.append(f"Low process-to-air temperature differential (ΔT = {temp_diff:.1f} K)")

    # 3. Power Failure (PWF): Power < 3.5 kW or Power > 9.0 kW
    if power_kw < 3.5:
        failure_modes_detected.append("Power Failure (PWF - Underload/Stall)")
        root_causes.append(f"Spindle mechanical power below operational floor ({power_kw:.2f} kW < 3.5 kW)")
        actions.append("Inspect spindle motor power supply; check drive belt tension and motor phase voltage.")
    elif power_kw > 9.0:
        failure_modes_detected.append("Power Failure (PWF - Overload)")
        root_causes.append(f"Severe spindle power overload ({power_kw:.2f} kW > 9.0 kW limit)")
        actions.append("Emergency stop spindle; inspect drive inverter and examine mechanical assembly for binding.")

    # 4. Overstrain Failure (OSF): Overstrain > threshold
    if overstrain > osf_threshold:
        failure_modes_detected.append("Overstrain Failure (OSF)")
        root_causes.append(
            f"Cumulative overstrain fatigue ({overstrain:.0f} min·Nm > {osf_threshold} min·Nm threshold for Type {product_type})"
        )
        actions.append("Reduce feed rate and cutting depth; inspect workpiece clamping rigidity and toolholder seat.")

    # 5. Fallback for ML positive detection without single threshold breach
    if pred_binary == 1 and not failure_modes_detected:
        failure_modes_detected.append("Compounded Anomaly / Random Failure (RNF)")
        root_causes.append("Multivariate anomaly detected across torque-speed-temperature dynamics.")
        actions.append("Perform full diagnostic cycle; verify lubrication pressure and sensor calibration.")

    if not failure_modes_detected:
        failure_modes_detected.append("None (Operating Nominally)")
        root_causes.append("All sensor telemetry operating within safe physical boundaries.")
        actions.append("No maintenance required. Continue standard operational run.")

    return {
        "status": status,
        "failure_probability": round(float(prob_failure), 4),
        "risk_level": risk_level,
        "risk_badge": risk_badge,
        "diagnosed_failure_mode": " + ".join(failure_modes_detected),
        "root_causes": root_causes,
        "recommended_actions": actions,
        "telemetry_summary": {
            "type": product_type,
            "air_temperature_k": air_temp,
            "process_temperature_k": proc_temp,
            "temp_diff_k": round(temp_diff, 2),
            "rotational_speed_rpm": speed,
            "torque_nm": torque,
            "power_kw": round(power_kw, 2),
            "tool_wear_min": tool_wear,
            "overstrain_min_nm": round(overstrain, 1)
        }
    }
