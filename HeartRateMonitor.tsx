import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Heart, Lightbulb, Bluetooth, WifiIcon } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

const HeartRateMonitor = () => {
  const [heartRate, setHeartRate] = useState(0);
  const [bulbIP, setBulbIP] = useState('');
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [bluetoothDevice, setBluetoothDevice] = useState<BluetoothDevice | null>(null);
  const [bulbConnected, setBulbConnected] = useState(false);
  const [error, setError] = useState('');
  const [historicalData, setHistoricalData] = useState<Array<{time: string, heartRate: number}>>([]);

  // WebSocket connection
  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || `ws://${window.location.host}`;
    const wsConnection = new WebSocket(wsUrl);
    
    wsConnection.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'heartRate') {
        setHeartRate(data.value);
        addHistoricalData(data.value);
      }
    };

    wsConnection.onerror = (error) => {
      setError('WebSocket connection failed');
    };

    setWs(wsConnection);

    return () => {
      wsConnection.close();
    };
  }, []);

  const addHistoricalData = useCallback((value: number) => {
    setHistoricalData(prev => [...prev, {
      time: new Date().toLocaleTimeString(),
      heartRate: value
    }].slice(-20));
  }, []);

  // Connect to heart rate monitor via WebBluetooth
  const connectHeartRateMonitor = async () => {
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: ['heart_rate'] }]
      });
      
      setBluetoothDevice(device);
      const server = await device.gatt?.connect();
      const service = await server?.getPrimaryService('heart_rate');
      const characteristic = await service?.getCharacteristic('heart_rate_measurement');
      
      if (characteristic) {
        await characteristic.startNotifications();
        characteristic.addEventListener('characteristicvaluechanged', handleHeartRateChange);
      }
      
      setError('');
    } catch (err) {
      setError('Failed to connect to heart rate monitor: ' + (err as Error).message);
    }
  };

  // Handle incoming heart rate data
  const handleHeartRateChange = (event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const value = target.value?.getUint8(1) || 0;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'heartRate',
        value: value
      }));
    }
  };

  // Connect to smart bulb
  const connectSmartBulb = async () => {
    try {
      const response = await fetch('/api/bulb/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ bulbIP })
      });
      
      const data = await response.json();
      if (data.success) {
        setBulbConnected(true);
        setError('');
      } else {
        setError('Failed to connect to smart bulb');
      }
    } catch (err) {
      setError('Failed to connect to smart bulb: ' + (err as Error).message);
    }
  };

  const getColorForHeartRate = (rate: number) => {
    if (rate < 60) return '#00ff00';
    if (rate < 100) return '#ffff00';
    return '#ff0000';
  };

  return (
    <div className="w-full max-w-4xl p-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Mobile Heart Rate Monitor
            <div className="flex space-x-2">
              <Bluetooth className={bluetoothDevice ? 'text-blue-500' : 'text-gray-400'} />
              <WifiIcon className={bulbConnected ? 'text-green-500' : 'text-gray-400'} />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Heart 
                className={`${heartRate > 0 ? 'text-red-500 animate-pulse' : 'text-gray-400'}`}
              />
              <span className="text-2xl font-bold">{heartRate} BPM</span>
            </div>
            <Lightbulb
              size={24}
              style={{ color: getColorForHeartRate(heartRate) }}
              className={bulbConnected ? 'animate-pulse' : ''}
            />
          </div>

          {!bulbConnected && (
            <div className="flex space-x-2">
              <Input
                type="text"
                placeholder="Smart Bulb IP Address"
                value={bulbIP}
                onChange={(e) => setBulbIP(e.target.value)}
              />
              <Button onClick={connectSmartBulb}>
                Connect Bulb
              </Button>
            </div>
          )}

          {!bluetoothDevice && (
            <Button 
              onClick={connectHeartRateMonitor}
              className="w-full bg-blue-500 hover:bg-blue-600"
            >
              Connect Heart Rate Monitor
            </Button>
          )}

          {error && (
            <div className="text-red-500 text-sm">{error}</div>
          )}

          {historicalData.length > 0 && (
            <div className="h-64">
              <LineChart
                width={600}
                height={200}
                data={historicalData}
                margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis domain={[0, 200]} />
                <Tooltip />
                <Line type="monotone" dataKey="heartRate" stroke="#8884d8" />
              </LineChart>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
