import React, {useState, useEffect} from 'react'
import {Modal, Form, Input, Select, InputNumber, Switch} from 'antd'
import {api} from "../services/api.js";
import {useNotification} from "../context/NotificationContext.jsx";

export default function TagForm({tagId, deviceId, onClose, onSave}) {
  const notification = useNotification();
  const [form] = Form.useForm()
  const [formData, setFormData] = useState({
    deviceId: deviceId || '',
    name: '',
    address: 1,
    registerType: 'HOLDING_REGISTER',
    deviceDataType: 'int16',
    serverDataType: 'int32',
    accessType: 'ReadOnly',
    enabled: true
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (tagId) {
      loadTag()
    } else if (deviceId) {
      setFormData(prev => ({...prev, deviceId}))
    }
  }, [tagId, deviceId])

  useEffect(() => {
    form.setFieldsValue(formData)
  }, [formData, form])

  const loadTag = async () => {
    try {
      const response = await api.getTagById(tagId)
      setFormData(response.data)
    } catch (error) {
      console.error('Error loading tag:', error)
      notification.error('Ошибка загрузки тега', error.message || "")
    }
  }

  const handleSubmit = async () => {
    try {
      await form.validateFields()
      setLoading(true)

      const requestFormData = {
        ...formData,
      }

      if (tagId) {
        await api.updateTagById(tagId, requestFormData)
      } else {
        await api.createTag(requestFormData)
      }
      onSave()
    } catch (error) {
      if (error.errorFields) {
        // Валидация не прошла
        return
      }
      console.error('Error saving tag:', error)
      notification.error('Ошибка при сохранении тега', error.message || "")
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

  return (
    <Modal
      title={tagId ? 'Редактировать тег' : 'Создать тег'}
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
          rules={[{required: true, message: 'Введите название тега'}]}
        >
          <Input/>
        </Form.Item>

        <Form.Item
          label="Адрес регистра (0-65535)"
          name="address"
          rules={[
            {required: true, message: 'Введите адрес регистра'},
            {type: 'number', min: 0, max: 65535, message: 'Адрес должен быть от 0 до 65535'}
          ]}
        >
          <InputNumber min={0} max={65535} style={{width: '100%'}}/>
        </Form.Item>

        <Form.Item
          label="Тип регистра"
          name="registerType"
          rules={[{required: true, message: 'Выберите тип регистра'}]}
        >
          <Select>
            <Select.Option value="HOLDING_REGISTER">Holding Register</Select.Option>
            <Select.Option value="INPUT_REGISTER">Input Register</Select.Option>
            <Select.Option value="COIL">Coil</Select.Option>
            <Select.Option value="DISCRETE_INPUT">Discrete Input</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item
          label="Тип данных в устройстве"
          name="deviceDataType"
          rules={[{required: true, message: 'Выберите тип данных в устройстве'}]}
        >
          <Select>
            <Select.Option value="int16">int16</Select.Option>
            <Select.Option value="int32">int32</Select.Option>
            <Select.Option value="uint16">uint16</Select.Option>
            <Select.Option value="uint32">uint32</Select.Option>
            <Select.Option value="float">float</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item
          label="Тип данных в сервере"
          name="serverDataType"
          rules={[{required: true, message: 'Выберите тип данных в сервере'}]}
        >
          <Select>
            <Select.Option value="int32">int32</Select.Option>
            <Select.Option value="int16">int16</Select.Option>
            <Select.Option value="uint32">uint32</Select.Option>
            <Select.Option value="uint16">uint16</Select.Option>
            <Select.Option value="float">float</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item
          label="Тип доступа"
          name="accessType"
          rules={[{required: true, message: 'Выберите тип доступа'}]}
        >
          <Select>
            <Select.Option value="ReadOnly">Только чтение</Select.Option>
            <Select.Option value="ReadWrite">Чтение и запись</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item
          label="Включен в работу"
          name="enabled"
          valuePropName="checked"
        >
          <Switch checkedChildren="on" unCheckedChildren="off"/>
        </Form.Item>
      </Form>
    </Modal>
  )
}
