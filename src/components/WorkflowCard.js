import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch } from 'react-native';

export default function WorkflowCard({ workflow, onToggle, onPress, onRun }) {
  const isSuccess = workflow.lastStatus === 'success';

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={onPress}>
      <View style={styles.topRow}>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>{workflow.name}</Text>
          <Text style={styles.description} numberOfLines={1}>
            {workflow.description}
          </Text>
        </View>
        <Switch
          value={workflow.enabled}
          onValueChange={onToggle}
          trackColor={{ false: '#334155', true: '#3B82F6' }}
          thumbColor={workflow.enabled ? '#FFFFFF' : '#94A3B8'}
        />
      </View>

      <View style={styles.divider} />

      <View style={styles.footerRow}>
        <View style={styles.badgeGroup}>
          <View style={styles.nodeBadge}>
            <Text style={styles.nodeBadgeText}>{workflow.nodeCount} nodes</Text>
          </View>
          <View style={[styles.statusBadge, isSuccess ? styles.bgSuccess : styles.bgDanger]}>
            <Text style={styles.statusBadgeText}>
              {isSuccess ? '✓ Success' : '✕ Failed'}
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.runButton} onPress={onRun}>
          <Text style={styles.runButtonText}>▶ Run</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleContainer: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  description: {
    color: '#94A3B8',
    fontSize: 13,
  },
  divider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 12,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badgeGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  nodeBadge: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  nodeBadgeText: {
    color: '#CBD5E1',
    fontSize: 12,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  bgSuccess: { backgroundColor: 'rgba(16, 185, 129, 0.2)' },
  bgDanger: { backgroundColor: 'rgba(239, 68, 68, 0.2)' },
  statusBadgeText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '600',
  },
  runButton: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
  },
  runButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
});
