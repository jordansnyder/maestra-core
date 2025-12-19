FROM python:3.11-slim

WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose OSC ports (UDP)
EXPOSE 57120/udp
EXPOSE 57121/udp

# Run the gateway
CMD ["python", "gateway.py"]
