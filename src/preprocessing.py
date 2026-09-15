"""
PredictaMaint Preprocessing Module
Extracts feature engineering and input transformations matching the model training pipeline.
"""

import numpy as np
import pandas as pd

DROP_COLS = ['UDI', 'Product ID', 'TWF', 'HDF', 'PWF', 'OSF', 'RNF']

def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Applies the exact 7 feature engineering techniques from the training pipeline:
    1. Removes ID and leakage failure-mode columns
    2. Temp_Diff: Process temperature - Air temperature
    3. Power_kW: Mechanical power (Torque * Speed * 2*pi/60) / 1000
    4. Wear_x_Torque: Stress interaction (Tool wear * Torque)
    5. Wear_Level: Discretized tool wear bins (Low, Medium, High)
    6. One-hot encoding for Type and Wear_Level
    """
    df_fe = df.copy()
    
    # Drop irrelevant / target-leakage columns if present
    df_fe = df_fe.drop(columns=[c for c in DROP_COLS if c in df_fe.columns], errors='ignore')
    
    # Feature transformations
    if 'Process temperature [K]' in df_fe.columns and 'Air temperature [K]' in df_fe.columns:
        df_fe['Temp_Diff'] = df_fe['Process temperature [K]'] - df_fe['Air temperature [K]']
        
    if 'Torque [Nm]' in df_fe.columns and 'Rotational speed [rpm]' in df_fe.columns:
        df_fe['Power_kW'] = (df_fe['Torque [Nm]'] * df_fe['Rotational speed [rpm]'] * (2 * np.pi / 60)) / 1000.0
        
    if 'Tool wear [min]' in df_fe.columns and 'Torque [Nm]' in df_fe.columns:
        df_fe['Wear_x_Torque'] = df_fe['Tool wear [min]'] * df_fe['Torque [Nm]']
        
    if 'Tool wear [min]' in df_fe.columns:
        df_fe['Wear_Level'] = pd.cut(
            df_fe['Tool wear [min]'],
            bins=[-1, 100, 200, 300],
            labels=['Low', 'Medium', 'High']
        )
        
    # One-hot encoding (drop_first=True matches training dummy encoding)
    cat_cols = [c for c in ['Type', 'Wear_Level'] if c in df_fe.columns]
    if cat_cols:
        df_fe = pd.get_dummies(df_fe, columns=cat_cols, drop_first=True)
        
    return df_fe


def prepare_inference_features(input_df: pd.DataFrame, expected_columns: list) -> pd.DataFrame:
    """
    Engineers features from raw telemetry and aligns columns to match the trained model's feature set.
    """
    df_fe = engineer_features(input_df)
    # Align to model feature matrix, filling missing dummy columns with 0
    df_aligned = df_fe.reindex(columns=expected_columns, fill_value=0)
    return df_aligned
