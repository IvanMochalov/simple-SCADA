import React, {useState, useEffect} from 'react'
import {Modal, Form, Input, Select, Switch, Alert} from 'antd'
import './Form.css'
import {api} from "../services/api.js";
import {useNotification} from "../context/NotificationContext.jsx";

const initialNodeFormData = {
  name: '',
  type: 'COM',
  comPort: 'COM3',
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  enabled: true
}

export default function ConnectionNodeForm({nodeId, onClose, onSave}) {
  const notification = useNotification();
  const [form] = Form.useForm()
  const [formData, setFormData] = useState({
    ...initialNodeFormData
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (nodeId) {
      loadNode()
    }
  }, [nodeId])

  useEffect(() => {
    form.setFieldsValue(formData)
  }, [formData, form])

  const loadNode = async () => {
    try {
      const response = await api.getNodeById(nodeId)
      setFormData(response.data)
    } catch (error) {
      console.error('Error loading node:', error)
      notification.error('Ошибка загрузки узла', error.message || "")
    }
  }

  const handleSubmit = async () => {

    const requestFormData = {
      ...formData,
    }

    try {
      if (nodeId) {
        await api.updateNodeById(nodeId, requestFormData)
      } else {
        await api.createNode(requestFormData)
      }
      onSave()
    } catch (error) {
      console.error('Error saving node:', error)
      notification.error('Ошибка при сохранении узла', error.message || "")
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

  const isEnabledTypeCOM = formData.type === 'COM';

  return (
    <Modal
      title={nodeId ? 'Редактировать узел связи' : 'Создать узел связи'}
      open={true}
      onCancel={onClose}
      onOk={handleSubmit}
      confirmLoading={loading}
      cancelText={"Отмена"}
      okText={"Сохранить"}
      okButtonProps={{
        disabled: !isEnabledTypeCOM
      }}
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
          rules={[{required: true, message: 'Введите название'}]}
        >
          <Input/>
        </Form.Item>

        <Form.Item
          label="Тип узла"
          name="type"
          rules={[{required: true, message: 'Выберите тип узла'}]}
        >
          <Select>
            <Select.Option value={"COM"}>COM порт</Select.Option>
            <Select.Option value={"TCP_IP"}>TCP/IP</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item
          label="Включен в работу"
          name="enabled"
          valuePropName="checked"
        >
          <Switch checkedChildren="on" unCheckedChildren="off"/>
        </Form.Item>

        {!isEnabledTypeCOM && (
          <Alert title="Поддержка TCP/IP в разработке" type="warning"/>
        )}

        {isEnabledTypeCOM && (
          <React.Fragment>
            <Form.Item
              label="Порт"
              name="comPort"
              rules={[{required: true, message: 'Введите COM порт'}]}
            >
              <Input/>
            </Form.Item>

            <Form.Item
              label="Скорость (бод)"
              name="baudRate"
            >
              <Select>
                <Select.Option value={9600}>9600</Select.Option>
                <Select.Option value={19200}>19200</Select.Option>
                <Select.Option value={38400}>38400</Select.Option>
                <Select.Option value={57600}>57600</Select.Option>
                <Select.Option value={115200}>115200</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item
              label="Биты данных"
              name="dataBits"
            >
              <Select>
                <Select.Option value={5}>5</Select.Option>
                <Select.Option value={6}>6</Select.Option>
                <Select.Option value={7}>7</Select.Option>
                <Select.Option value={8}>8</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item
              label="Стоп-биты"
              name="stopBits"
            >
              <Select>
                <Select.Option value={1}>1</Select.Option>
                <Select.Option value={2}>2</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item
              label="Четность"
              name="parity"
            >
              <Select>
                <Select.Option value="none">Не используется</Select.Option>
                <Select.Option value="even">Четная</Select.Option>
                <Select.Option value="odd">Нечетная</Select.Option>
              </Select>
            </Form.Item>
          </React.Fragment>
        )}

      </Form>
    </Modal>
  )
}