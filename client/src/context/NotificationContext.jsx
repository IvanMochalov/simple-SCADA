import React, {createContext, useContext} from 'react';
import {notification} from 'antd';

const NotificationContext = createContext(null);

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider');
  }
  return context;
};

const styleFn = ({props}) => {
  if (props.type === 'error') {
    return {
      root: {
        backgroundColor: `#fff2f0`,
      },
    };
  }
  if (props.type === 'success') {
    return {
      root: {
        backgroundColor: `#f6ffed`,
      },
    };
  }
  if (props.type === 'warning') {
    return {
      root: {
        backgroundColor: `#fffbe6`,
      },
    };
  }
  return {};
};

const sharedProps = {
  styles: styleFn,
  showProgress: true
}

export const NotificationProvider = ({children}) => {
  const [api, contextHolder] = notification.useNotification();

  const methods = {
    success: (message, description = '') => {
      api.success({
        ...sharedProps,
        message,
        description,
      });
    },
    error: (message, description = '') => {
      api.error({
        ...sharedProps,
        message,
        description,
      });
    },
    info: (message, description = '') => {
      api.info({
        ...sharedProps,
        message,
        description,
      });
    },
    warning: (message, description = '') => {
      api.warning({
        ...sharedProps,
        message,
        description,
      });
    },
    open: (config) => {
      api.open({
        ...sharedProps,
        ...config,
      });
    },
    destroy: (key) => {
      if (key) {
        api.destroy(key);
      } else {
        api.destroy();
      }
    }
  };

  return (
    <NotificationContext.Provider value={methods}>
      {contextHolder}
      {children}
    </NotificationContext.Provider>
  );
};