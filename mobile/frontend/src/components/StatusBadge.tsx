import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

interface StatusBadgeProps {
  status?: string;
  size?: 'small' | 'medium';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status = 'PENDING_VERIFICATION', size = 'small' }) => {
  let label = 'Pending Approval';
  let bgColor = '#FEF3C7';
  let textColor = '#B45309';
  let icon: 'clock' | 'check-circle' | 'x-circle' | 'alert-triangle' | 'edit-2' = 'clock';

  switch (status) {
    case 'PENDING_VERIFICATION':
    case 'PENDING':
      label = 'Pending Review';
      bgColor = '#FEF3C7';
      textColor = '#B45309';
      icon = 'clock';
      break;
    case 'EDITED':
      label = 'Draft Edited';
      bgColor = '#E0F2FE';
      textColor = '#0369A1';
      icon = 'edit-2';
      break;
    case 'VERIFIED':
      label = 'Verified';
      bgColor = '#DCFCE7';
      textColor = '#15803D';
      icon = 'check-circle';
      break;
    case 'REJECTED':
      label = 'Rejected';
      bgColor = '#FEE2E2';
      textColor = '#B91C1C';
      icon = 'x-circle';
      break;
    case 'REVERSED':
      label = 'Reversed';
      bgColor = '#F1F5F9';
      textColor = '#64748B';
      icon = 'alert-triangle';
      break;
    default:
      label = status;
      bgColor = '#F1F5F9';
      textColor = '#475569';
      icon = 'clock';
  }

  const isSmall = size === 'small';

  return (
    <View style={[styles.badge, { backgroundColor: bgColor }, isSmall ? styles.badgeSmall : styles.badgeMedium]}>
      <Feather name={icon} size={isSmall ? 11 : 13} color={textColor} style={{ marginRight: 4 }} />
      <Text style={[styles.text, { color: textColor }, isSmall ? styles.textSmall : styles.textMedium]}>
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  badgeSmall: {
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeMedium: {
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  text: {
    fontWeight: '700',
  },
  textSmall: {
    fontSize: 11,
  },
  textMedium: {
    fontSize: 12,
  },
});

export default StatusBadge;
