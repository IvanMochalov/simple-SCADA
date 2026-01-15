import React, {useState, useEffect} from 'react'
import {Modal, Form, Input, Select, InputNumber, Switch} from 'antd'
import {api} from "../services/api.js";
import {useNotification} from "../context/NotificationContext.jsx";

export default function DeviceForm({deviceId, nodeId, onClose, onSave}) {
  const notification = useNotification();
  const [form] = Form.useForm()
  const [formData, setFormData] = useState({
    connectionNodeId: nodeId || '',
    name: '',
    address: 17,
    responseTimeout: 1000,
    pollInterval: 1000,
    enabled: true
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (deviceId) {
      loadDevice()
    }
  }, [deviceId])

  useEffect(() => {
    form.setFieldsValue(formData)
  }, [formData, form])

  const loadDevice = async () => {
    try {
      const response = await api.getDeviceById(deviceId)
      setFormData(response.data)
    } catch (error) {
      console.error('Error loading device:', error)
      notification.error('Ошибка загрузки устройства', error.message || "")
    }
  }

  const handleSubmit = async () => {
    try {
      await form.validateFields()
      setLoading(true)

      const requestFormData = {
        ...formData,
      }

      if (deviceId) {
        await api.updateDeviceById(deviceId, requestFormData)
      } else {
        await api.createDevice(requestFormData)
      }
      onSave()
    } catch (error) {
      if (error.errorFields) {
        // Валидация не прошла
        return
      }
      console.error('Error saving device:', error)
      notification.error('Ошибка при сохранении устройства', error.message || "")
    } finally {
      setLoading(false)
    }
  }

  const handleFormChange = (changedValues, allValues) => {
    setFormData(prev => ({
      ...prev,
      ...changedValues
    }))
  }
  console.log("nodeId: -->", nodeId);

  return (
    <Modal
      title={deviceId ? 'Редактировать устройство' : 'Создать устройство'}
      open={true}
      onCancel={onClose}
      onOk={handleSubmit}
      confirmLoading={loading}
      cancelText={"Отмена"}
      okText={"Сохранить"}
    >
      <Form
        form={form}
        layout="vertical"
        onValuesChange={handleFormChange}
        onFinish={handleSubmit}
        initialValues={formData}
        disabled={loading}
      >

        <Form.Item
          label="Название"
          name="name"
          rules={[{required: true, message: 'Введите название устройства'}]}
        >
          <Input/>
        </Form.Item>

        <Form.Item
          label="Включен в работу"
          name="enabled"
          valuePropName="checked"
        >
          <Switch checkedChildren="on" unCheckedChildren="off"/>
        </Form.Item>

        <Form.Item
          label="Адрес Modbus (0-255)"
          name="address"
          rules={[
            {required: true, message: 'Введите адрес Modbus'},
            {type: 'number', min: 0, max: 255, message: 'Адрес должен быть от 0 до 255'}
          ]}
        >
          <InputNumber min={0} max={255} style={{width: '100%'}}/>
        </Form.Item>

        <Form.Item
          label="Время ответа (мс)"
          name="responseTimeout"
          rules={[
            {required: true, message: 'Введите время ответа'},
            {type: 'number', min: 100, message: 'Время ответа должно быть не менее 100 мс'}
          ]}
        >
          <InputNumber min={100} step={100} style={{width: '100%'}}/>
        </Form.Item>

        <Form.Item
          label="Период опроса (мс)"
          name="pollInterval"
          rules={[
            {required: true, message: 'Введите период опроса'},
            {type: 'number', min: 100, message: 'Период опроса должен быть не менее 100 мс'}
          ]}
        >
          <InputNumber min={100} step={100} style={{width: '100%'}}/>
        </Form.Item>
      </Form>
    </Modal>
  )
}
