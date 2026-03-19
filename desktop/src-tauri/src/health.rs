use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ServiceHealth {
    pub name: String,
    pub healthy: bool,
    pub url: String,
    pub detail: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HealthReport {
    pub services: Vec<ServiceHealth>,
    pub all_healthy: bool,
}

async fn check_endpoint_owned(name: String, url: String) -> ServiceHealth {
    check_endpoint(&name, &url).await
}

async fn check_endpoint(name: &str, url: &str) -> ServiceHealth {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .unwrap();

    match client.get(url).send().await {
        Ok(resp) => ServiceHealth {
            name: name.to_string(),
            healthy: resp.status().is_success(),
            url: url.to_string(),
            detail: format!("HTTP {}", resp.status().as_u16()),
        },
        Err(e) => ServiceHealth {
            name: name.to_string(),
            healthy: false,
            url: url.to_string(),
            detail: format!("{}", e),
        },
    }
}

#[tauri::command]
pub async fn check_service_health() -> Result<HealthReport, String> {
    let checks = vec![
        ("Fleet Manager", "http://localhost:8080/health"),
        ("NATS", "http://localhost:8222/healthz"),
        ("Dashboard", "http://localhost:3001"),
        ("Node-RED", "http://localhost:1880"),
        ("Grafana", "http://localhost:3000/api/health"),
    ];

    let mut handles = vec![];
    for (name, url) in checks {
        handles.push(tokio::spawn(check_endpoint_owned(
            name.to_string(),
            url.to_string(),
        )));
    }

    let mut results = vec![];
    for handle in handles {
        if let Ok(result) = handle.await {
            results.push(result);
        }
    }
    let all_healthy = results.iter().all(|s| s.healthy);

    Ok(HealthReport {
        services: results,
        all_healthy,
    })
}
