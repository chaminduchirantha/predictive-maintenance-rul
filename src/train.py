"""
PredictaMaint Training Pipeline
Trains the production Gradient Boosting classifier with SMOTE resampling
and exports model artifacts to the models/ directory.
"""

import os
import joblib
import pandas as pd
from sklearn.model_selection import train_test_split, StratifiedKFold, GridSearchCV
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import GradientBoostingClassifier
from imblearn.over_sampling import SMOTE

from src.preprocessing import engineer_features

def run_training_pipeline(
    data_path: str = "data/ai4i2020.csv",
    models_dir: str = "models",
    optimize_hyperparams: bool = False
):
    print(f"Loading dataset from: {data_path}")
    df = pd.read_csv(data_path).dropna().drop_duplicates()
    
    print("Applying feature engineering pipeline...")
    df_fe = engineer_features(df)
    
    X = df_fe.drop(columns=['Machine failure'])
    y = df_fe['Machine failure']
    feature_columns = X.columns.tolist()
    
    print(f"Dataset shape post-feature engineering: {df_fe.shape}")
    print(f"Target distribution:\n{y.value_counts()}")
    
    # Stratified 80/20 train/test split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=42
    )
    
    # Feature scaling
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    # SMOTE oversampling applied ONLY on training split
    print("Applying SMOTE resampling to training split...")
    smote = SMOTE(random_state=42)
    X_train_res, y_train_res = smote.fit_resample(X_train_scaled, y_train)
    
    if optimize_hyperparams:
        print("Optimizing hyperparameters with 5-fold StratifiedKFold GridSearchCV...")
        param_grid = {
            'n_estimators': [100, 200],
            'learning_rate': [0.05, 0.1, 0.2],
            'max_depth': [2, 3, 4]
        }
        cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
        grid = GridSearchCV(
            GradientBoostingClassifier(random_state=42),
            param_grid=param_grid,
            scoring='recall',
            cv=cv,
            n_jobs=-1
        )
        grid.fit(X_train_res, y_train_res)
        final_model = grid.best_estimator_
        print(f"Best parameters: {grid.best_params_}")
    else:
        print("Training GradientBoostingClassifier with calibrated parameters...")
        final_model = GradientBoostingClassifier(
            n_estimators=100,
            learning_rate=0.1,
            max_depth=3,
            random_state=42
        )
        final_model.fit(X_train_res, y_train_res)
        
    os.makedirs(models_dir, exist_ok=True)
    model_path = os.path.join(models_dir, "machine_failure_model.pkl")
    scaler_path = os.path.join(models_dir, "scaler.pkl")
    features_path = os.path.join(models_dir, "model_features.pkl")
    
    joblib.dump(final_model, model_path)
    joblib.dump(scaler, scaler_path)
    joblib.dump(feature_columns, features_path)
    
    print(f"Exported artifacts successfully to {models_dir}/:")
    print(f"- {model_path}")
    print(f"- {scaler_path}")
    print(f"- {features_path}")
    
    return final_model, scaler, feature_columns

if __name__ == "__main__":
    run_training_pipeline()
