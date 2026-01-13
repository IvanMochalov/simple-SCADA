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
    success: (title, description = '') => {
      api.success({
        ...sharedProps,
        title,
        description,
      });
    },
    error: (title, description = '') => {
      api.error({
        ...sharedProps,
        title,
        description,
      });
    },
    info: (title, description = '') => {
      api.info({
        ...sharedProps,
        title,
        description,
      });
    },
    warning: (title, description = '') => {
      api.warning({
        ...sharedProps,
        title,
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